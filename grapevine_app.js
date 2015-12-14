// http server stuff
var express = require('express');
//starting express module
var app = express();
//telling express to root at the public folder
app.use(express.static('public'));
//using http module to create a server out of the express module
var server = require('http').Server(app);
//instantiating socket.io module with server as argument
//any socket made with socket io library will be bound to the server
var io = require('socket.io')(server);

var port = 8081;
//listens on localhost:8081 for event emissions
server.listen(port);
console.log('listening on port ' + port);

var grapevine = require('./grapevine');
//define the init function
grapevine.init(function(){
	//grapevine.countries ends up being the countries_json data
	var countries = grapevine.countries;

	//socket is specific to each clients connection
	io.on('connection', function (socket) {
		console.log("received connection");
		var search_query;
		//when we receive search message, do function(data)
		socket.on('search', function (data) {

			//data = JSON.parse(data);
			var search_query = data.search_query;
			var countries = data.countries;
			console.log(search_query);
			console.log(countries);		
			var grapes = function(i)
			{
				console.log("grapes(" + i + ")");
				grapevine.simulate_country(search_query, countries[i], function(result){
					console.log('country simulated ' + countries[i]);
					socket.emit('news', { country_code: countries[i], news: result });
				});			
			};
			for (var i = 0; i < countries.length; i++)
			{
				grapes(i);
			}
		});
		socket.on('error', function (err) {
			console.log("Error: " + err);
		});

		//send an ack message
		// note that "emit" does not
		socket.emit('ack', countries);

	});
});
