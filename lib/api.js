'use strict';

var path = require('path');
var url = require('url');
var fs = require('fs');
var _ = require('lodash');

var async = require('async');
var request = require('request');

request = request.defaults({
    json: true
});

var getObjectsUrlString = function getIssuesUrlString(urlstring, callback) {
    request({
        url: urlstring,
        headers: {
            'User-Agent': 'request'
        }
    }, function (err, response, objs) {
        if (err) {
            callback(err);
        } else {
            var next = null;
            var linkString = response.headers.link;
            if (linkString) {
                var links = linkString.split(',');
                links.forEach(function (link) {
                    if (link.indexOf('rel="next"') > -1) {
                        next = link.split('>;')[0].split('<')[1];
                    }
                });
            }
            if (next) {
                getIssuesUrlString(next, function (err, nextObjs) {
                    if (err) {
                        callback(err);
                    } else {
                        Array.prototype.push.apply(objs, nextObjs);
                        callback(null, objs);
                    }
                });
            } else {
                callback(null, objs);
            }
        }
    });
};

var getIssues = exports.getIssues = function (username, reponame, token, callback) {
    var urlObj = {
        protocol: 'https',
        hostname: 'api.github.com',
        pathname: path.join('repos', username, reponame, 'issues'),
        query: {
            access_token: token,
            state: 'all'
        }
    };
    var urlstring = url.format(urlObj);
    getObjectsUrlString(urlstring, callback);
};

var getComments = exports.getComments = function (username, reponame, token, callback) {
    var urlObj = {
        protocol: 'https',
        hostname: 'api.github.com',
        pathname: path.join('repos', username, reponame, 'issues', 'comments'),
        query: {
            access_token: token
        }
    };
    var urlstring = url.format(urlObj);
    getObjectsUrlString(urlstring, callback);
};

var transferMultiRepoIssuesToFile = exports.transferMultiRepoIssuesToFile = function (username, reponames, token, targetDirectory, callback) {
    var iterator = function (repo, cb) {
        getIssues(username, repo, token, function (err, issues) {
            if (err) {
                cb(err);
            } else {
                var filePath = path.join(targetDirectory, repo + '.json');
                fs.writeFile(filePath, JSON.stringify(issues, undefined, 4), function (err) {
                    cb(err);
                });
            }
        });
    };

    async.each(reponames, iterator, callback);
};

var transferMultiRepoIssueCommentsToFile = exports.transferMultiRepoIssueCommentsToFile = function (username, reponames, token, targetDirectory, callback) {
    var iterator = function (repo, cb) {
        getComments(username, repo, token, function (err, comments) {
            if (err) {
                cb(err);
            } else {
                var filePath = path.join(targetDirectory, repo + '_comments.json');
                fs.writeFile(filePath, JSON.stringify(comments, undefined, 4), function (err) {
                    cb(err);
                });
            }
        });
    };

    async.each(reponames, iterator, callback);
};

exports.transferMultiRepoIssueInfoToFiles = function (username, reponames, token, targetDirectory, callback) {
    transferMultiRepoIssuesToFile(username, reponames, token, targetDirectory, function (err) {
        if (err) {
            callback(err);
        } else {
            transferMultiRepoIssueCommentsToFile(username, reponames, token, targetDirectory, callback);
        }
    });
};

var addRepoToCommit = function (username, reponame, comment) {
    var piece = comment;
    var n = comment.length;
    var result = '';
    while (true) {
        var location = piece.search(/\b[0-9A-Fa-f]{40}\b/g);
        if (location > -1) {
            var index = location + 40;
            result += piece.substring(0, location);
            result += username + '/' + reponame + '@' + piece.substring(location, index);
            piece = piece.substring(index, n);
        } else {
            result += piece;
            return result;
        }
    }
};

var prepareIssuesForMove = exports.prepareIssuesForMove = function (username, reponame, issues, comments) {
    var issueUrlToIndex = issues.reduce(function (r, issue, index) {
        var url = issue.url;
        r[url] = index;
        return r;
    }, {});

    var result = issues.map(function (issue) {
        var r = {
            issue: {
                title: issue.title,
                body: issue.body,
                assignee: issue.user.login
            },
            closed: (issue.state === 'closed'),
            comments: []
        };
        if (issue.labels) {
            r.issue.labels = issue.labels.map(function (label) {
                return label.name;
            });
        }
        return r;
    });

    comments.forEach(function (comment) {
        var issueUrl = comment.issue_url;
        var index = issueUrlToIndex[issueUrl];
        if (index === undefined) {
            console.log(issueUrl);
            console.log(issueUrlToIndex);
        }
        var newComment = addRepoToCommit(username, reponame, comment.body);
        if (!result[index]) {
            console.log(index);
            console.log(result.length);
        }
        result[index].comments.unshift(newComment);
    });

    return result;
};

var filesToIssueInfos = function (generatedDirectory, username, reponame, callback) {
    var fileName = path.join(generatedDirectory, reponame + '.json');
    fs.readFile(fileName, function (err, data) {
        if (err) {
            callback(err);
        } else {
            var issues = JSON.parse(data);
            issues.reverse();
            var commentsFileName = path.join(generatedDirectory, reponame + '_comments.json');
            fs.readFile(commentsFileName, function (err, commentsData) {
                if (err) {
                    callback(err);
                } else {
                    var comments = JSON.parse(commentsData);
                    comments.reverse();
                    var newIssues = prepareIssuesForMove(username, reponame, issues, comments);
                    callback(null, newIssues);
                }
            });
        }
    });
};

var multiRepoFilesToIssueInfos = exports.multiRepoFilesToIssueInfos = function (generatedDirectory, username, reponames, callback) {
    var fn = function (repo, cb) {
        filesToIssueInfos(generatedDirectory, username, repo, cb);
    };

    async.mapSeries(reponames, fn, function (err, issues) {
        if (err) {
            callback(err);
        } else {
            var newIssues = _.flatten(issues);
            callback(null, newIssues);
        }
    });
};

var createIssue = exports.createIssue = function (username, reponame, token, issue, callback) {
    var urlObj = {
        protocol: 'https',
        hostname: 'api.github.com',
        pathname: path.join('repos', username, reponame, 'issues'),
        query: {
            access_token: token
        }
    };
    var urlstring = url.format(urlObj);
    request({
        url: urlstring,
        method: 'POST',
        headers: {
            'User-Agent': 'request'
        },
        body: issue
    }, function (err, response, body) {
        callback(err, body);
    });
};

var closeIssue = exports.closeIssue = function (username, reponame, token, issueNumber, callback) {
    var urlObj = {
        protocol: 'https',
        hostname: 'api.github.com',
        pathname: path.join('repos', username, reponame, 'issues', issueNumber),
        query: {
            access_token: token
        }
    };
    var urlstring = url.format(urlObj);
    request({
        url: urlstring,
        method: 'PATCH',
        headers: {
            'User-Agent': 'request'
        },
        body: {
            state: 'closed'
        }
    }, function (err, response, body) {
        callback(err, body);
    });
};

var addComment = exports.closeIssue = function (username, reponame, token, issueNumber, comment, callback) {
    var urlObj = {
        protocol: 'https',
        hostname: 'api.github.com',
        pathname: path.join('repos', username, reponame, 'issues', issueNumber, 'comments'),
        query: {
            access_token: token
        }
    };
    var urlstring = url.format(urlObj);
    request({
        url: urlstring,
        method: 'POST',
        headers: {
            'User-Agent': 'request'
        },
        body: {
            body: comment
        }
    }, function (err, response, body) {
        callback(err, body);
    });
};

var updateIssue = function (issueNumber, issueInfo, username, reponame, token, callback) {
    var fns = [];
    if (issueInfo.closed) {
        fns.push(function (cb) {
            closeIssue(username, reponame, token, issueNumber, cb);
        });
    }
    var cmt = function (comment) {
        return function (cb) {
            addComment(username, reponame, token, issueNumber, comment, cb);
        };
    };
    issueInfo.comments.forEach(function (comment) {
        fns.push(cmt(comment));
    });

    if (fns.length) {
        async.series(fns, callback);
    } else {
        callback(null);
    }

};

exports.moveIssuesToRepo = function (issueInfos, username, reponame, token, callback) {
    var fn = function (issueInfo, cb) {
        createIssue(username, reponame, token, issueInfo.issue, function (err, issue) {
            if (err) {
                cb(err);
            } else {
                if (!issue.number) {
                    console.log(issue);
                }
                updateIssue(issue.number.toString(), issueInfo, username, reponame, token, cb);
            }
        });
    };

    async.mapSeries(issueInfos, fn, callback);
};
