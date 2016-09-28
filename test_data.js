var userData = {
  1: {
      price: [1, 2],
      cuisine: {
        yes: ['afghani', 'korean', 'indpak'],
        no: ['pizza', 'polish']
      },
    locations: {
      //jp
      from: {latitude : 42.3097, longitude: -71.1151, mode : 'bicycling'},
      //northend
      to: {latitude : 42.3647, longitude : -71.0542, mode : 'bicycling'}
    }
  },
  2: {
      price: [2, 3, 4],
      cuisine: {
        yes: ['pubfood', 'vegetarian'],
        no: ['chinese', 'sushi']
    },
    locations: {
      //waltham
      from: {latitude : 42.3765, longitude: -71.2356, mode : 'transit'},
      //cambridgeport
      to: {latitude: 42.3596, longitude :  -71.1077 , mode : 'transit'}
    }
  },
  3: {
      price: [1,2],
      cuisine: {
        yes: ['tradamerican', 'vegetarian'],
        no: ['chinese', 'sushi']
    },
    locations: {
      //waltham
      from: {latitude : 42.3765, longitude: -71.2356, mode : 'transit'},
      //cambridgeport
      to: {latitude: 42.3596, longitude :  -71.1077 , mode : 'transit'}
    }
  }
}

var options = {
  method: 'POST',
  uri: 'http://localhost:4000',
  body: {
    userData: userData,
    term: 'dinner'
  },
  json: true // Automatically stringifies the body to JSON
};

return rp(options)
  .then(function(response) {
    debugger

  });
