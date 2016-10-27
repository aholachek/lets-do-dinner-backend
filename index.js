//get environment variables from .env
require('dotenv').config();

var firebase = require('firebase');
var _ = require('lodash');

var server = require('./api_server');
var findTopMatches = require('./findTopMatches');

//run server for now, just so old test interface is still supported
server();

firebase.initializeApp({
  databaseURL: 'https://lets-do-dinner.firebaseio.com/',
  serviceAccount: './firebase.json'
});

function setVotingTimeout(val, inviteRef) {
  //setTimeout to move record to voting stage
  if (val.stage === 'preferences') {
    // setTimeout to end the preference stage
    var timeToPreferences = new Date(val.dueAt) - new Date();
    if (timeToPreferences < 0) {
      inviteRef.update({
        stage: 'voting'
      });
    } else {

      setTimeout(function() {
        inviteRef.update({
          stage: 'voting'
        });
      }, timeToPreferences);
    }
  }

}

function setDeleteTimeout(val, inviteRef) {
  //setTimeout to delete the record in 72 hours
  //this should catch older records if database went down
  //created time
  var deleteTime = new Date(val.createdAt).getTime()
    //72 hours
    +
    1000 * 60 * 60 * 60 * 72;
  //how far away is delete time from our current time?
  deleteTimeFromNow = deleteTime - new Date().getTime();
  if (deleteTimeFromNow < 0) inviteRef.remove();
  else {
    setTimeout(function() {
      inviteRef.remove();
    }, deleteTimeFromNow);
  }
}

firebase.database().ref('/invites').on('child_added', function(snapshot) {
  var val = snapshot.val();
  if (val && val.inviteId) {

    var inviteRef = firebase.database().ref('/invites/' + val.inviteId);

    setDeleteTimeout(val, inviteRef);
    setVotingTimeout(val, inviteRef);

    inviteRef.on('value', function(snapshot) {

      var val = snapshot.val();
      if (!val) return;

      //admin has closed preference entry/time has finished,
      //time to calculate matches
      //as long as at least 1 person has submitted preferences
      if (val.stage === 'voting' && !val.matches && _.keys(val.preferences).length > 0) {
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
      }
    });
  }

});

//when 72 hour timeout removes an invite, remove the event listener as well
firebase.database().ref('/invites').on('child_removed', function(snapshot) {
  firebase.database().ref('/invites/' + snapshot.val().inviteId).off();
});
