
var rp = require('request-promise');
rp.debug = true;

var geolib = require('geolib');

var keys = require('./secret_keys');

var locs = {
  'Davis Square' : { latitude : 42.3967, longitude : -71.1223 },
  'Union Square' : { latitude : 42.3837, longitude : -71.0958 },
  'Kendall Square' : { latitude : 42.3629, longitude : 71.0901 },
}

var center  = geolib.getCenter(locs);

debugger



var cuisines = [];

process.argv.forEach(function (val, index, array) {
  if (index > 1){
    cuisines.push(val);
  }
});

var yelp_access_token;

function getYelpAccessToken(){
  var options = {
      method: 'POST',
      uri: 'https://api.yelp.com/oauth2/token',
      form : {
          client_id : keys.Yelp.id,
          client_secret : keys.Yelp.secret,
          grant_type : 'client_credentials'
      },
      json: true // Automatically stringifies the body to JSON
  };

  return rp(options)
      .then(function (response) {
        yelp_access_token = response.access_token;
      })
      .catch(function (err) {
          // API call failed...
      });

}

function queryYelp(){
  //make sure token is already there, only needs to happen once
  if (!yelp_access_token) {
    getYelpAccessToken().then(function(){queryYelp(arguments)});
  } else {

    debugger

    var options = {
        uri: 'https://api.yelp.com/v3/businesses/search',
        qs : {
          term : 'restaurants',
          ll : center.latitude + ',' + center.longitude,
          categories : cuisines.join(','),
          limit : 10,
          price : '1,2,3',
        },
        headers: {
       'Authorization': 'Bearer ' + yelp_access_token
   },
        json: true // Automatically stringifies the body to JSON
    };

    rp(options)
        .then(function (response) {
        debugger
        })
        .catch(function(error){
          debugger
        })



  }

}

queryYelp();
