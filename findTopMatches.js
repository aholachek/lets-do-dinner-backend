//get environment variables from .env
require('dotenv').config();

var rp = require('request-promise');

var _ = require('lodash');
var geolib = require('geolib');
var yelpCategories = require('./yelp_categories.json');

//this needs to be outside function scope
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
    json: true
  };

  return rp(options)
    .then(function(response) {
      yelp_access_token = response.access_token;
    });

}

function queryYelp(term, preferences, centers) {
  //make sure token is already there, only needs to happen once
  if (!yelp_access_token) {
    return getYelpAccessToken().then(function() {
      return queryYelp(term, preferences, centers);
    });

  } else {

    var nestedPromises = centers.map(function(c) {

      var options = {
        uri: 'https://api.yelp.com/v3/businesses/search',
        qs: {
          term: term,
          latitude: c.split(',')[0],
          longitude: c.split(',')[1],
          categories: _.keys(preferences.yes).join(','),
          limit: 10,
          price: preferences.price.join(','),
        },
        headers: {
          'Authorization': 'Bearer ' + yelp_access_token
        },
        json: true
      };

      //wildcard matches
      var allRestaurantOptions = _.cloneDeep(options);
      delete allRestaurantOptions.qs.categories;
      allRestaurantOptions.limit = 5;

      return [rp(options), rp(allRestaurantOptions)];

    });

    return Promise.all(_.flatten(nestedPromises));
  }
}

function filterMatchesByPreferences(preferences, responses) {

  var matches = _.flatten(responses.map(function(r) {
    return r.businesses
  }));

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
  }).slice(0, 25);

  return matches;
}

function findMostConvenientRestaurants(locationData, matches) {

  var destinations = matches.map(function(b) {
    return [b.coordinates.latitude + ',' + b.coordinates.longitude];
  });

  return getTravelTime(locationData, destinations).then(function(destinationDict) {

    matches.forEach(function(m, i) {
      m.time = destinationDict[m.coordinates.latitude + ',' + m.coordinates.longitude];
    });

    var sortedMatches = _.sortBy(matches, function(m) {
      return -m.time.score
    });

    return sortedMatches

  });

}

function findMostConvenientLoci(locationData, loci) {

  //now just a list of lat/long w/o quadrant info
  lociVals = _.values(loci);

  var destinations = lociVals.map(function(v) {
    return v.latitude + ',' + v.longitude;
  });

  return getTravelTime(locationData, destinations).then(function(times, index) {

    scores = _.sortBy(_.toPairs(times), function(t) {
      return -t[1].score
    });

    console.log('most convenient locis are:', scores.slice(0, 2))

    return scores.slice(0, 2).map(function(s) {
      return s[0]
    });

  });

}

function variance(arr) {
  var mean = arr.reduce(function(a, b) {
    return a + b
  }, 0) / arr.length;
  var variances = arr.map(function(n) {
    return Math.pow(n - mean, 2)
  });
  var variance = variances.reduce(function(a, b) {
    return a + b
  }, 0) / arr.length;
  return variance
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

  var destinationDict = {};
  destinations.forEach(function(d) {
    destinationDict[d] = {
      total: undefined,
      variance: undefined,
      origins: {},
    }
  });

  var allPromises = [];

  _.toPairs(modeDict).forEach(function(pair) {

    var mode = pair[0];
    var arr = pair[1];
    var opts = _.cloneDeep(options);
    opts.qs.mode = mode;
    opts.qs.origins = arr.map(function(location) {
      return location.latitude + ',' + location.longitude;
    }).join('|');

    var prom = rp(opts);
    allPromises.push(prom);
    prom.then(function(response) {
      //iterate through origins (where people are)
      //each row represents a different origin
      response.rows.map(function(row, index) {
        var originId = arr[index].userId;
        row.elements.forEach(function(d, i) {
          //destination is "long,lat"
          var destination = destinations[i];
          try {
            destinationDict[destination].origins[originId] = d.duration.value;
          } catch (e) {
            //sometimes there's an error, not sure why
            console.log(e, row.elements);
          }
        });
      });
    });
  });

  //use 'all' just to verify that destinationDict has been filled
  return Promise.all(allPromises).then(function() {
    //finally, sum up all the vals
    _.forEach(destinationDict, function(v, k) {
      v.total = _.sum(_.values(v.origins));
      v.variance = variance(_.values(v.origins));
    });

    var minTime = _.min(_.values(destinationDict).map(function(t) {
      return t.total
    }));

    var minVariance = _.min(_.values(destinationDict).map(function(t) {
      return t.variance
    }));

    //if there are only 2 people, minimize variance
    //otherwise, lean on minimizing time
    _.forEach(destinationDict, function(v, k) {
      if (origins.length > 2) v.score = (minTime / v.total * 1.5) + minVariance / v.variance;
      else v.score = (minTime / v.total) + (minVariance / v.variance * 1.5);
    });

    return destinationDict;
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
    .then(_.partial(findMostConvenientRestaurants, locationData));
}

module.exports = findTopMatches
