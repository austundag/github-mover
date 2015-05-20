'use strict';

var path = require('path');
var url = require('url');
var fs = require('fs');

var async = require('async');
var request = require('request');

request = request.defaults({
    json: true
});

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
    request({
        url: urlstring,
        headers: {
            'User-Agent': 'request'
        }
    }, function (err, response, issues) {
        if (err) {
            console.log(err);
        } else {
            callback(err, issues);
        }
    });
};

exports.transferMultiRepoIssuesToFile = function (username, reponames, token, targetDirectory, callback) {
    var iterator = function (repo, callback) {
        getIssues(username, repo, token, function (err, issues) {
            if (err) {
                callback(err);
            } else {
                var filePath = path.join(targetDirectory, repo + '.json');
                fs.writeFile(filePath, JSON.stringify(issues, undefined, 4), function (err) {
                    callback(err);
                });
            }
        });
    };

    async.each(reponames, iterator, callback);
};

var prepareIssues = exports.prepareIssues = function (srcIssues) {
    var result = srcIssues.map(function (srcIssue) {
        var issue = {
            title: srcIssue.title,
            body: srcIssue.body,
            assignee: srcIssue.user.login,
            close: (srcIssue.state === 'closed')
        };
        if (srcIssue.labels) {
            issue.labels = srcIssue.labels.map(function (label) {
                return label.name;
            });
        }
        return issue;
    });
    return result;
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

exports.moveIssuesToRepo = function (issues, username, reponame, token, callback) {
    var newIssues = prepareIssues(issues);

    var fn = function (newIssue, cb) {
        var close = newIssue.close;
        delete newIssue.close;
        createIssue(username, reponame, token, newIssue, function (err, createdIssue) {
            if (err || !close) {
                cb(err, createdIssue);
            } else {
                closeIssue(username, reponame, token, createdIssue.number.toString(), cb);
            }
        });
    };

    async.mapSeries(newIssues, fn, callback);
};
