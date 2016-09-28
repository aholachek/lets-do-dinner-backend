var rp = require('request-promise');

var _ = require('lodash');
var geolib = require('geolib');
var yelpCategories = require('./yelp_categories.json');

var yelp_access_token;

function getYelpAccessToken() {
  var options = {
    method: 'POST',
    uri: 'https://api.yelp.com/oauth2/token',
    form: {
      client_id: process.env.YELP_ID,
      client_secret: process.env.YELP_SECRET,
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
        limit: 25,
        price: preferences.price.join(','),
        sort_by: 'distance',
        actionlinks : true
      },
      headers: {
        'Authorization': 'Bearer ' + yelp_access_token
      },
      json: true
    };

    var allRestaurantOptions = _.cloneDeep(options);
    delete allRestaurantOptions.qs.categories;
    allRestaurantOptions.qs.limit = 10;
    delete allRestaurantOptions.sort_by;

    return Promise.all([rp(options), rp(allRestaurantOptions)]);
  }
}

function filterMatchesByPreferences(preferences, responses) {

  var matches = responses[0].businesses.concat(responses[1].businesses);
  //dedupe

  matches = _.uniqBy(matches, function(m) {
    return m.id
  });

  //exclude restaurants based on 'no' preferences
  var toExclude = _.keys(preferences.no);
  matches = _.filter(matches, function(m) {
    if (
      _.intersection(
        m.categories.map(function(c) {
          return c.alias
        }), toExclude
      ).length == 0
    ) {
      return true
    }
  });

  //sort based on star rating
  //we will be finding coordinates for this many restaurants
  matches = _.sortBy(matches, function(m) {
    return -m.rating
  }).slice(0, 10);

  return matches;
}

function findMostConvenientRestaurants(locationData, matches) {

  var getDistanceTimes = matches.map(function(b) {
    var destination = [b.coordinates.latitude + ',' + b.coordinates.longitude];
    return getTravelTime(locationData, destination);
  });

  return Promise.all(getDistanceTimes).then(function(times) {

    times = times.map(function(t) {
      //get a dict with userId : time
      var individual = {};
      t.forEach(function(time, index) {
        individual[locationData[index].userId] = {time : time, mode : locationData[index].mode }
      });
      return {
        individual: individual,
        total: _.sum(t)
      };
    });

    matches.forEach(function(match, index, list) {
      list[index].time = times[index];
    });

    var sortedMatches = _.sortBy(matches,
      function(b) {
        return b.time.total;
      });

    return sortedMatches

  });

}

function findMostConvenientLoci(locationData, loci) {

  //now just a list of lat/long w/o quadrant info
  lociVals = _.values(loci);

  var getDistanceTimes = lociVals.map(function(v) {
    var destination = [v.latitude + ',' + v.longitude];
    return getTravelTime(locationData, destination);
  });

  function variance(arr){
    var mean = arr.reduce(function(a, b){return a + b}, 0)/arr.length;
    var variances = arr.map(function(n){ return Math.pow(n - mean, 2)});
    var variance = variances.reduce(function(a, b){return a + b}, 0)/arr.length;
    return variance
  }

  return Promise.all(getDistanceTimes).then(function(times, index) {

    //where times is initially an array of times for each person
    times = times.map(function(t) {
      return {
        total : _.sum(t),
        variance : variance(t)
      }
    });

    var minTime = _.min(times.map(function(t){return t.total}));
    var minVariance = _.min(times.map(function(t){return t.variance}));

    //weight 'minimizing time' a bit more than 'minimizing variance'
    var scores = times.map(function(t){
      return (minTime/t.total * 1.5) + minVariance/t.variance
    });

    var maxScore = _.max(scores);
    var maxScoreIndex = scores.indexOf(maxScore);

    console.log('most convenient loci is:', _.keys(loci)[maxScoreIndex])
    console.log(_.keys(loci), times)
    return lociVals[maxScoreIndex];

  });

}

/* expects an array of origins in the form :
{ latitude : 42.3765, longitude: -71.2356, mode : 'transit' },
*/

function getTravelTime(origins, destinations) {

  //sort origins by mode of travel (need to make multiple requests)
  var modeDict = _.groupBy(origins, function(d) {
    return d.mode
  });

  var options = {
    uri: 'https://maps.googleapis.com/maps/api/distancematrix/json',
    qs: {
      //add origins later based on mode
      origins: undefined,
      mode: undefined,
      destinations: destinations.join('|'),
      key: process.env.GOOGLE_KEY
    },
    json: true

  };

  var modePromises = [];

  _.forEach(modeDict, function(arr, mode) {
    var opts = _.cloneDeep(options);
    opts.qs.mode = mode;
    opts.qs.origins = arr.map(function(location) {
      return location.latitude + ',' + location.longitude;
    }).join('|');

    modePromises.push(rp(opts));

  });

  return Promise.all(modePromises)
  //messy nested structure, have to get all the times out to add them later
    .then(function(responses) {

      var minuteVals = [];

      responses.forEach(
        function(r) {
          return r.rows.map(
            function(r) {
              return r.elements.map(
                function(e) {
                  if (!e.duration) console.log('error!', responses);
                  //convert seconds to minutes
                  minuteVals.push(Math.ceil(e.duration.value/60));
                });
            });
        });

      return minuteVals;

    });
}

//maybe later get smarter about ranking?
function rankMatches(preferences, matches) {

  return _.sortBy(matches, function(m, i) {
    return m.time.total;
  });

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

function findLoci(locations) {

  var maxBounds = {
    N: _.max(locations.map(function(l) {
      return l.latitude
    })),
    S: _.min(locations.map(function(l) {
      return l.latitude
    })),
    E: _.min(locations.map(function(l) {
      return l.longitude
    })),
    W: _.max(locations.map(function(l) {
      return l.longitude
    })),
  };

  var loci = {
    center: {}
  };

  //find average center
  loci.center.latitude = locations.map(function(l) {
      return l.latitude
    })
    .reduce(function(mem, num) {
      return mem + num
    }, 0) / locations.length;

  loci.center.longitude = locations.map(function(l) {
      return l.longitude
    })
    .reduce(function(mem, num) {
      return mem + num
    }, 0) / locations.length;

  //add the rest of the points by averaging a bound with the center
  ['NW', 'NE', 'SE', 'SW'].forEach(function(direction) {
    var directions = direction.split('');
    loci[direction] = {
      latitude: (loci.center.latitude + maxBounds[directions[0]]) / 2,
      longitude: (loci.center.longitude + maxBounds[directions[1]]) / 2,
    }
  });

  return loci;

}

function convertUserDataToLocationsArray(userData) {
  var toReturn = [];

  return userData.map(function(u) {
    //let's get rid of the "to" value for now to save on api calls
    return _.extend({
      userId: u.userId
    }, u.locations.from);

  });

}

function findTopMatches(data) {

  var term = data.term || 'dinner';

  //this has mode info and user id info attached
  var locationData = convertUserDataToLocationsArray(data.userData);

  //this is just a list of [{ latitude :x, longitude : y}]
  var locations = _.flatten(
    data.userData.map(function(u) {
      var toReturn = [];
      if (u.locations.from.longitude) toReturn.push(u.locations.from);
      //not handling to atm
      if (u.locations.to.longitude) toReturn.push(u.locations.to);
      return toReturn;
    })
  );

  var preferences = _.values(data.userData)
    .map(function(x) {
      return _.pick(x, 'cuisine', 'price');
    });

  transformedPreferences = transformPreferences(preferences);

  return findMostConvenientLoci(locationData, findLoci(locations))
    .then(_.partial(queryYelp, term, transformedPreferences))
    .then(_.partial(filterMatchesByPreferences, transformedPreferences))
    .then(_.partial(findMostConvenientRestaurants, locationData))
    .then(_.partial(rankMatches, transformedPreferences));
}

module.exports = findTopMatches
