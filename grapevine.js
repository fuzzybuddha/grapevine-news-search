//  grapevine setup
var https = require('https');
var http = require('http');
var socks = require('socksv5');
var countries_json = require('./countries.json');
var googleApiKey = require('./api_key.json');
var exec = require('child_process').exec;
var querystring = require('querystring');
var striptags = require('striptags');
var log4js = require('log4js');
var parser = require('xml2json');
var cheerio = require('cheerio');
var striptags = require('striptags');

log4js.configure({
  appenders: [
   // { type: 'console' },
    { type: 'file', filename: 'grapevine.log' }
  ]
});
var logger = log4js.getLogger();
var grapevine = {
	countries: countries_json,
	base_socks_port: 9050,
	base_control_port: 15000,
	API_KEY: googleApiKey.key,

	// setting this to true makes everything use a single tor instance on port 9050
  // instead of a different tor instance for each country
	debug: true,
	init: function(callback) {
		if (this.debug) {
			return callback();
		}
		var that = this;
		// kill all tor instances
		exec('killall tor', function(error, stdout, stderr) {
	   		if (error) {
                // rn('No tor instances to kill');
                // rn(error);
	   		}
			var i = 1;
			var j = 0;
            console.log("that.countries: ");
            console.log(that.countries);
			for (key in that.countries) {
				var socksPort = that.base_socks_port + i;
				var controlPort = that.base_control_port + i;
				that.countries[key].socksPort = socksPort;
				that.countries[key].controlPort = controlPort;

				var pidFilename = 'tor' + i + '.pid';
				var dataDirectory = 'tor_data/tor' + i;
				var exitNode = '{' + key.toLowerCase() + '}';
				var torCommand = 'tor --RunAsDaemon 1 --PidFile ' + pidFilename + ' --SocksPort ' + socksPort + ' --DataDirectory ' + dataDirectory + ' --ExitNodes ' + exitNode;
				i++;
		        exec(torCommand, function(error, stdout, stderr){
		          if (error) {
                    // warn('tor command failed: ' + torCommand);
		            // logger.warn(error);
		          }
		          else {
                    // info('Successfully connected via ' + torCommand.substring(torCommand.length - 3));
		          }
		          j++;
		          if (j >= Object.keys(that.countries).length)
		          {
		            callback();
		          }
		        });
			}
		});
	},
	//https call to google translate API
	translate: function(search_query, from_language, to_language, callback){
		if (from_language.toLowerCase() == to_language.toLowerCase()) {
			return callback(search_query);
		}

		// URL encode the search string
		search_query = querystring.escape(search_query);
		var httpOptions = {
			host: 'www.googleapis.com',
			port: 443,
//			path: '/language/translate/v2?key=' + this.API_KEY + '&source=' + from_language + '&target=' + to_language + '&q=' + search_query,
			path: '/language/translate/v2?key=' + this.API_KEY + '&q=' + search_query + '&source=' + from_language + '&target=' + to_language,
			method: 'GET'
		};

		// logger.debug("translation path: ", httpOptions.host + httpOptions.path);

		var request = https.request(httpOptions, function(response) {
            // logger.debug("response data: ", response);
			// logger.debug("statusCode: ", response.statusCode);
			// logger.debug("headers: ", response.headers);
			var response_string = '';
			response.on('data', function(d) {
				response_string += d;
                // logger.debug('response_string: ', response_string);
			});
			response.on('end', function() {
				var translation;
                // logger.info("response_string: ", response_string);
				var response_data = JSON.parse(response_string).data;
				if (response_data) {
					translation = response_data.translations[0].translatedText;
				}
				else {
					translation = 'No translation available.';
				}
				callback(translation);
			});
			response.on('error', function(err) {
				logger.warn('Error receiving translation api response: ' + err);
        		logger.warn('Trying again');
        		logger.warn('Is google translate working?');
        		grapevine.translate(search_query, from_language, to_language, callback);
			});
		});
		request.end();

		request.on('error', function(err) {
			// logger.warn('Error sending translation api request: ' + err);
            // er.warn('Trying again');
      		grapevine.translate(search_query, from_language, to_language, callback);
		});
	},
	// hit news api with search term, sending request thru appropriate tor instance
	get_news_about: function(search_query, country_code, language_code, result_start, callback){
		// URL encode the search string
		search_query = querystring.escape(search_query);
		var torPort;
		if (this.debug)
		{
			torPort = 9050;
		}
		else
		{
			torPort = this.countries[country_code].socksPort;
		}
//		var torPort = 9050;
		// logger.info('getting news about ' + search_query + ' from country ' + country_code);

		// tor config
		var socksConfig = {
		  proxyHost: '127.0.0.1',
		  proxyPort: torPort,
		  auths: [ socks.auth.None() ]
		};
		// request config
		var httpOptions = {
			host: 'news.google.com',
		  	port: 443,
		  	// path: '/ajax/services/search/news?v=1.0&ned=' + country_code + '&start=' + result_start + '&rsz=8&hl=' + language_code + '&q=' + search_query,
            path: '/news/feeds?pz=1&cf=all&ned='+language_code+'&hl='+country_code+'&q='+search_query+'&output=rss',
            method: 'GET',
	 		agent: new socks.HttpsAgent(socksConfig)
		};
		logger.info(httpOptions.host + httpOptions.path);

		var request = https.request(httpOptions, function(response) {
            logger.info('response.data = ', response.data);
			response.resume();
			var response_string = '';
			response.on('data', function(d) {
				response_string += d;
			});
			response.on('end', function() {
				// var response_json = JSON.parse(response_string);
                // logger.info("response_string: ", response_string);
				callback(response_string);
			});
			response.on('error', function(err) {
				logger.warn('Error receiving news api response: ' + err);
				logger.warn('Trying again');
        		logger.warn('Is google news apis working?');
        		get_news_about(search_query, country_code, language_code, result_start, callback);
			});
		});
		request.end();

		request.on('error', function(err) {
			logger.warn('Error sending news api request: ' + err);
			logger.warn('Trying again');
    		logger.warn('Is google apis working?');
    		get_news_about(search_query, country_code, language_code, result_start, callback);

		});
	},
	check_ip_for_country: function(country_code, callback)
	{
		var country = this.countries[country_code];
		if (country === undefined) {
			// logger.error('No country found for country code: ' + country_code);
			return;
		}
		// should derive torPort from country_code
//		var torPort = 9050;
		var torPort = country.socksPort;
		var socksConfig = {
		  proxyHost: '127.0.0.1',
		  proxyPort: torPort,
		  auths: [ socks.auth.None() ]
		};

		var httpOptions = {
			// this is ip of "whatsmyip" server
			host: '130.211.135.85',
		  	port: 80,
		  	path: '/',
		  	method: 'GET',
	 		agent: new socks.HttpAgent(socksConfig)
		};

		var req = http.request(httpOptions, function(res) {
			res.resume();
			var response_string = '';
			res.on('data', function(d) {
				response_string += d;
			});
			res.on('end', function() {
				var json = JSON.parse(response_string);
				var exit_node_country = json.country;
				callback(exit_node_country.toLowerCase().trim(), country_code.toLowerCase().trim());
			});
			res.on('error', function(err) {
				logger.warn('Error receiving response to request' + httpOptions);
				logger.warn(err);
			});
		});
		req.end();

		req.on('error', function(err) {
			logger.warn('Error sending request' + httpOptions);
			logger.warn(err);
		});
	},
	simulate_country: function(search_query, country_code, from_language, result_start, callback)
	{
	    // logger.info('Searching ' + search_query + ' from ' + country_code);
		var that = this;
        var sim_country_callback = callback;
		var to_language = this.countries[country_code].language_code;
        console.log("to_language", to_language);
		this.translate(search_query, from_language, to_language, function(result){
			var translation = result;
			logger.info(search_query + '-->' + translation);
			that.get_news_about(translation, country_code, to_language, result_start, function(result){
				var news_stories = [];
				var translated = 0;
                // console.log("result = ", result);
                var news_xml = result;
                var news_json = parser.toJson(news_xml);
                for(idx in JSON.parse(news_json).rss.channel.item){
                    var xml_news_description = JSON.parse(news_json).rss.channel.item[idx].description.split('<font size="-1">');
                    news_stories[idx] = {};
                    news_stories[idx].untranslated_title = JSON.parse(news_json).rss.channel.item[idx].title;
                    news_stories[idx].link = JSON.parse(news_json).rss.channel.item[idx].link;
                    news_stories[idx].source = striptags(xml_news_description[1]);
                    news_stories[idx].untranslated_summary = striptags(xml_news_description[2]);
                }

                var xhtmlUnescape = function(escapedXhtml) {
					escapedXhtml = escapedXhtml.replace(/&quot;/g, '"');
					escapedXhtml = escapedXhtml.replace(/&amp;/g, '&');
					escapedXhtml = escapedXhtml.replace(/&lt;/g, '<');
					escapedXhtml = escapedXhtml.replace(/&gt;/g, '>');
					escapedXhtml = escapedXhtml.replace(/&#39;/g, "'");
					escapedXhtml = escapedXhtml.replace(/&nbsp;/g, " ");
					return escapedXhtml;
				};

                var add_translations = function(news_stories, callback){
                    var news = [];
                    //for each news story
                    for(idx in news_stories){
                        var translated = 0;
                        translator(idx, function(result){
                            news.push(result);
                            if(++translated==idx){
                                callback(news);
                            }
                        });
                    }
                }

                var translator = function(idx, callback){
                    that.translate(news_stories[idx].untranslated_summary, to_language, from_language, function(result){
                        news_stories[idx].translated_summary = xhtmlUnescape(result);
                        that.translate(news_stories[idx].untranslated_title, to_language, from_language, function(result){
                            news_stories[idx].translated_title = xhtmlUnescape(result);
                            callback(news_stories[idx]);
                        });
                    });
                }

                //add translated versions into news stories
                add_translations(news_stories, function(news){
                    logger.info("hello hello line 300 news_stories...", news);
                    // grapevine.news_stories = news_stories;
                    callback(news);
                });

            });
        });

	},
	shutdown : function (callback)
	{
		// kill all tor instances
		exec('killall tor', function(error, stdout, stderr) {
	   		if (error) {
                // rn(error);
                // rn(stderr);
	   		}
		});
		callback();
	}
};

module.exports = grapevine;
//99:37:9f:8d:d6:7b:5f:f0:3a:b1:f0:8c:71:bf:0a:d1
