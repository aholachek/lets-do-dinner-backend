
var rp = require('request-promise');
rp.debug = true;

var keys = require('./secret_keys');

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

    var options = {
        uri: 'https://api.yelp.com/v3/businesses/search',
        qs : {
          term : 'restaurants',
          location : '02139',
          categories : cuisines.join(','),
          limit : 10,
          price : [1,2,3],
        },
        headers: {
       'Authorization': 'Bearer ' + yelp_access_token
   },
        json: true // Automatically stringifies the body to JSON
    };

    rp(options)
        .then(function (repos) {
        debugger
        })



  }

}

queryYelp();
