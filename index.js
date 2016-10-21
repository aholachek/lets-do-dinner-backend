//get environment variables from .env
require('dotenv').config();

var firebase = require('firebase');
var _ = require('lodash');

var server = require('./api_server');
var findTopMatches = require('./findTopMatches');

//run server for now, just so old test interface is still supported
server();

firebase.initializeApp({
  databaseURL: 'https://letsgetdinnerfrontend.firebaseio.com/',
  serviceAccount: './firebase.json'
});

firebase.database().ref('/invites').on('child_added', function(snapshot) {
  var val = snapshot.val();
  if (val && val.inviteId) {

    var inviteRef = firebase.database().ref('/invites/' + val.inviteId);

    inviteRef
      .on('value', function(snapshot) {
        var val = snapshot.val();
        if (!val) return;
        //admin has closed preference entry, time to calculate matches
        if (val.stage === 'voting' && !val.matches) {
          var userData = [];
          //findTopMatches expects an array of userData instead of an object
          _.forEach(val.preferences, function(v, k) {
            userData.push(_.extend(v, {
              userId: k
            }));
          });
          var data = {
            userData: userData,
            term: val.meal
          };
          findTopMatches(data).then(function(matches) {
            if (matches) {
              inviteRef.update({
                matches: matches,
              });
            }
          });
        } else if (val.stage === 'done' && !val.finalRecommendation) {
          var finalRecommendation = calculateTopMatch(val.matches, val.submittedVotes);
          inviteRef.update({
            finalRecommendation: finalRecommendation,
            stage: 'done'
          });
        }
      });
  }

});

function calculateTopMatch(matches, votes) {
  var top, topVoteNum, topVotedPlaces;

  top = _.toPairs(votes);
  top = _.sortBy(top, function(p) {
    return -p[1].length
  });
  topVoteNum = top[0][1].length;
  topVotedPlaces = top.filter(function(p) {
    return p[1].length === topVoteNum;
  });

  if (topVotedPlaces.length === 1) {
    return topVotedPlaces[0];
  } else {
    //break the tie
    return _.sortBy(topVotedPlaces, function(p) {
      var m = matches.filter(function(m) {
        return m.id === p[0]
      })[0];
      return m.time.total;
    })[0][0];
  }
}


firebase.database().ref('/invites').on('child_removed', function(snapshot) {
  firebase.database().ref('/invites/' + snapshot.val().inviteId).off();
});
