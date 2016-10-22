var express = require('express');
var cors = require('cors');
var app = express();
var bodyParser = require('body-parser');

var findTopMatches = require('./findTopMatches');

var port = process.env.PORT || 4000;

app.use(bodyParser.json());

//allow requests only from my website and localhost

var corsOptions = {
  origin: [/^http:\/\/alex\.holachek\.com.*/]
};

if (process.env.NODE_ENV === 'development'){
  corsOptions.origin.push(/^http:\/\/localhost:.{4}/);
}

app.options('/', cors(corsOptions));

//because heroku  free dynos go to sleep, give an option
//for lets do dinner v1 (which only uses a worker to contact firebase)
// to ping the server to wake it up
app.get('/', cors(corsOptions), function(req, res){
    return res.json({ msg : 'wake up successful'});
});

app.post('/', cors(corsOptions), function(req, res) {

  findTopMatches(req.body).then(function(results) {
    return res.json(results);
  }, function(error) {
    var prettyPrintStack =  error.stack.split('\n');
    console.log('error!', prettyPrintStack);
    return res.status(500).send(error.stack);
  }
  );
});

module.exports = function() {
  app.listen(port);
}
