var rp = require('request-promise');
// rp.debug = true;

var _ = require('lodash');
var geolib = require('geolib');
var keys = require('./secret_keys');

var yelpCategories = require('./yelp_categories.json');

var cuisines = [];

process.argv.forEach(function(val, index, array) {
  if (index > 1) {
    cuisines.push(val);
  }
});

var yelp_access_token;

function getYelpAccessToken() {
  var options = {
    method: 'POST',
    uri: 'https://api.yelp.com/oauth2/token',
    form: {
      client_id: keys.Yelp.id,
      client_secret: keys.Yelp.secret,
      grant_type: 'client_credentials'
    },
    json: true // Automatically stringifies the body to JSON
  };

  return rp(options)
    .then(function(response) {
      yelp_access_token = response.access_token;
    });

}

function queryYelp(term, preferences, center) {
  //make sure token is already there, only needs to happen once
  if (!yelp_access_token) {
    return getYelpAccessToken().then(function() {
      return queryYelp(term, preferences, center);
    });

  } else {

    var options = {
      uri: 'https://api.yelp.com/v3/businesses/search',
      qs: {
        term: term,
        latitude: center.latitude,
        longitude: center.longitude,
        categories: _.keys(preferences.yes).join(','),
        // in meters, eq ~10 miles
        radius: 16000,
        limit: 5,
        price: preferences.price.join(','),
      },
      headers: {
        'Authorization': 'Bearer ' + yelp_access_token
      },
      json: true
    };

    var allRestaurantOptions = _.cloneDeep(options);
    delete allRestaurantOptions.qs.categories;
    allRestaurantOptions.qs.sort_by = 'rating';

    return Promise.all([rp(options), rp(allRestaurantOptions)]);
  }
}

function filterMatchesByPreferences(preferences, responses) {

  var matches = responses[0].businesses.concat(responses[1].businesses);
  //dedupe
  matches = _.uniq(matches, function(m) {
    return m.id
  });

  //exclude restaurants based on 'no' preferences
  var toExclude = _.keys(preferences.no);
  matches = _.filter(matches, function(m){
    if (
      _.intersection(
      m.categories.map(function(c){return c.alias}), toExclude
    ).length == 0
    ){
      return true
    }
  });

  //sort based on star rating
  matches = _.sortBy(matches, function(m) {
    return -m.rating
  }).slice(0, 50);

  return matches;
}

function findMostConvenientRestaurants(locations, matches) {

  //convert long/lat to proper form
  locations = locations.map(function(l){
    return l.latitude + ',' + l.longitude
  });

  var getDistanceTimes = matches.map(function(b) {
    var destination = [b.coordinates.latitude + ',' + b.coordinates.longitude];
    return getTravelTime(locations, destination);
  });

  return Promise.all(getDistanceTimes).then(function(times) {

    debugger
    times = times.map(function(t) {
      return _.sum(t);
    });

    matches.forEach(function(b, i, l) {
      l[i].totalTime = times[i];
    });

    debugger

    var sortedMatches = _.sortBy(matches,
      function(b) {
        return b.totalTime;
      });

    return sortedMatches

  });

}

function getTravelTime(origins, destinations) {

  var options = {
    uri: 'https://maps.googleapis.com/maps/api/distancematrix/json',
    qs: {
      origins: origins.join('|'),
      destinations: destinations.join('|'),
      mode: 'transit',
      key: keys.Google.key
    },
    json: true

  };

  return rp(options)
    .then(function(response) {
      var minutes = response.rows.map(
        function(r) {
          return r.elements[0].duration.value
        }
      );
      return minutes;
    });
}

//for now, just return matches
//later think up a nicer sorting algorithm
function rankMatches(matches) {
  return matches
}

function transformPreferences(preferences) {
  //lowest user max = max
  //lowest user min = min
  var max = 4;
  var min = 4;
  preferences.forEach(function(p) {
    var userMax = _.max(p.price),
      userMin = _.min(p.price);
    if (userMax < max) {
      max = userMax
    }
    if (userMin < min) min = userMin
  });

  //combine the cuisine preferences
  function convertPreferences(preferences, type) {
    return _.countBy(_.flatten(
      preferences.map(function(p) {
        return p.cuisine[type]
      })
    ), function(x) {
      return x
    });
  }
  var yes = convertPreferences(preferences, 'yes');
  var no = convertPreferences(preferences, 'no');

  return {
    price: _.range(min, max + 1),
    yes: yes,
    no: no
  }

}

function findTopMatches(data) {

  var term = data.term || 'dinner';

  var locations = _.flatten(
    _.map(data.userData, function(v, k) {
      return [v.locations.from, v.locations.to]
    })
  );

  var center = geolib.getCenterOfBounds(locations);
  var preferences = _.values(data.userData)
    .map(function(x) {
      return x.preferences
    });

  transformedPreferences = transformPreferences(preferences);

   return queryYelp(term, transformedPreferences, center)
    .then(_.partial(filterMatchesByPreferences, transformedPreferences))
    .then(_.partial(findMostConvenientRestaurants, locations))
    .then(rankMatches)

}

module.exports = findTopMatches
