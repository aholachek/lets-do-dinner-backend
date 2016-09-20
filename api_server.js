var express = require('express');
var cors = require('cors');
var app = express();
var bodyParser = require('body-parser');

var findTopMatches = require('./findTopMatches');

var port = process.env.PORT || 4000;

app.use(cors());
app.use(bodyParser.json());

app.post('/', function(req, res) {
  findTopMatches(req.body).then(function(results) {
    res.json(results);
  }, function(error) {
    res.status(500).send(error);
  });
});

module.exports = function() {
  app.listen(port);
}
