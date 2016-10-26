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
        }
      });
  }

});



firebase.database().ref('/invites').on('child_removed', function(snapshot) {
  firebase.database().ref('/invites/' + snapshot.val().inviteId).off();
});
