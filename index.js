var rp = require('request-promise');

var server = require('./api_server');
var yelpCategories = require('./yelp_categories.json');

//start server
server();

// var userData = {
//   1: {
//     preferences: {
//       price: [1, 2],
//       cuisine: {
//         yes: ['afghani', 'korean', 'indpak'],
//         no: ['pizza', 'polish']
//       }
//     },
//     locations: {
//       //jp
//       from: {latitude : 42.3097, longitude: -71.1151},
//       //northend
//       to: {latitude : 42.3647, longitude : -71.0542}
//     }
//   },
//   2: {
//     preferences: {
//       price: [2, 3, 4],
//       cuisine: {
//         yes: ['pubfood', 'vegetarian'],
//         no: ['chinese', 'sushi']
//       }
//     },
//     locations: {
//       //waltham
//       from: {latitude : 42.3765, longitude: -71.2356},
//       //cambridgeport
//       to: {latitude: 42.3596, longitude :  -71.1077}
//     }
//   }
// }
//
// var options = {
//   method: 'POST',
//   uri: 'http://localhost:4000',
//   body: {
//     userData: userData,
//     term: 'dinner'
//   },
//   json: true // Automatically stringifies the body to JSON
// };
//
// return rp(options)
//   .then(function(response) {
//     debugger
//
//   })
//   .catch(function(err) {
//     // API call failed...
//   });
