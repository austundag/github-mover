'use strict';

var path = require('path');
var url = require('url');

var curl = require('curlrequest');

exports.getIssues = function(username, reponame, token, callback) {
    var urlObj = {
        protocol: 'https',
        hostname: 'api.github.com',
        pathname: path.join('repos', username, reponame, 'issues'),
        query: {
        	access_token: token
        }
    };
    var urlstring = url.format(urlObj);
    curl.request({
    	url: urlstring,
    	useragent: 'curl/7.30.0'
    }, function (err, stdout, meta) {
    	if (err) {
	    	console.log(err);
		} else {
			var issues = JSON.parse(stdout);
			callback(err, issues);
		}
    });
};
