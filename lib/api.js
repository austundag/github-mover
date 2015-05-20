'use strict';

var path = require('path');
var url = require('url');
var fs = require('fs');

var async = require('async');
var request = require('request');

request = request.defaults({
    json: true
});

var getIssues = exports.getIssues = function(username, reponame, token, callback) {
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

exports.transferMultiRepoIssuesToFile = function(username, reponames, token, targetDirectory, callback) {
	var iterator = function(repo, callback) {
		getIssues(username, repo, token, function(err, issues) {
			if (err) {
				callback(err);
			} else {
				var filePath = path.join(targetDirectory, repo + '.json');
				fs.writeFile(filePath, JSON.stringify(issues, undefined, 4), function(err) {
					callback(err);
				});
			}
		});
	}

	async.each(reponames, iterator, callback);
};
