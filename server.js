var http = require('http');
var path = require('path');
var async = require('async');
var socketio = require('socket.io');
var express = require('express');
var mongoose = require('mongoose');
var passport = require('passport');
var util = require('util');
var CircularJSON = require('circular-json');
var GitHubStrategy = require('passport-github').Strategy;
var GITHUB_CLIENT_ID = "d1527f0d319039232e2e";
var GITHUB_CLIENT_SECRET = "ed8e95d75cc80f65c6a84e7963c8f006333a3230";
var router = express();
var bodyParser = require('body-parser');
var server = http.createServer(router);
var io = socketio.listen(server);
var methodOverride = require('method-override');
var morgan = require('morgan');
var cookieParser = require('cookie-parser');
var session = require("express-session");
mongoose.connect('mongodb://localhost/musicbox');
router.use(bodyParser.json());


var myIP = process.env.IP || "0.0.0.0";
var myPORT = process.env.PORT || 3000;

var curruser;

var userSchema = new mongoose.Schema({
  username: {type: String, required: true, unique: true},
  name: String,
  friends: {type: Array}
});

var postSchema = new mongoose.Schema({
  username: {type: String, required: true},
  message: String,
  track: String,
  playlist: String,
  time: {type: Date, default: Date.now}
});


var User = mongoose.model('User', userSchema);

var Post = mongoose.model('Post', postSchema);
// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.  However, since this example does not
//   have a database of user records, the complete GitHub profile is serialized
//   and deserialized.
passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

passport.use(new GitHubStrategy({
    clientID: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET,
    callbackURL: "https://music-box-nlane.c9.io/auth/github/callback"
  },
  function(accessToken, refreshToken, profile, done) {
    // asynchronous verification, for effect...
    process.nextTick(function () {
      var uname = profile.username;
      User.find({username:uname}).exec(function(err, documents){
        if(documents.length != 0){
          curruser = uname;
        }
        else{
          var newUser = new User({username:uname, name:profile.displayName});
          curruser = uname;
          newUser.save(function(err, user){
            if(err){
              console.log("error: ", err);
            }
            else{
              console.log(user);
            }
          });
        }
      });
            
      // To keep the example simple, the user's GitHub profile is returned to
      // represent the logged-in user.  In a typical routerlication, you would want
      // to associate the GitHub account with a user record in your database,
      // and return that user instead.
      return done(null, profile);
    });
  }
));


router.set('views', __dirname + '/views');
  router.set('view engine', 'ejs');
  router.use(morgan());
  router.use(cookieParser());
  router.use(bodyParser());
  router.use(methodOverride());
  router.use(session({ secret: 'keyboard cat' }));
  // Initialize Passport!  Also use passport.session() middleware, to support
  // persistent login sessions (recommended).
  router.use(passport.initialize());
  router.use(passport.session());

router.get('/', function(req, res){
  res.render('index', { user: req.user})
});

router.get('/account', ensureAuthenticated, function(req, res){
  res.render('account', { user: req.user });
});

router.get('/login', function(req, res){
  res.render('login', { user: req.user });
});


// GET /auth/github
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in GitHub authentication will involve redirecting
//   the user to github.com.  After authorization, GitHubwill redirect the user
//   back to this routerlication at /auth/github/callback
router.get('/auth/github',
  passport.authenticate('github'),
  function(req, res){
    // The request will be redirected to GitHub for authentication, so this
    // function will not be called.
  });

// GET /auth/github/callback
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
router.get('/auth/github/callback', 
  passport.authenticate('github', { failureRedirect: '/login' }),
  function(req, res) {
    res.redirect('/');
  });

router.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});


var server = http.createServer(router);
server.listen(myPORT, myIP);

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/login');
}

// returns this user's document
router.get('/info', function(req, res){
   User.find({username:curruser}).exec(function(err, documents){
    res.json(documents);
  });
})

//returns this user's posts
router.get('/posts', function(req, res){
   Post.find({username:curruser}).exec(function(err, documents){
    res.json(documents);
  });
})

//returns newsfeed of friends posts
router.get('/home', function(req, res){
   User.find({username:curruser}, {friends:1, _id:0}).exec(function(err, documents){
      var friendarray = documents;
      var fnds = friendarray[0].friends;
      Post.aggregate({$sort:{time:-1}}, {$match:{username:{$in:fnds}}}).exec(function(err, docs){
        res.json(docs);
      })
   });
})

//will add each other to friend's array
router.put('/friend', function(req, res){
  User.find({username:req.body.user}).exec(function(err, documents){
    if(documents.length != 0){
      User.update({username:curruser}, {$push:{friends:req.body.user}}).exec(function(err, documents){
        User.update({username:req.body.user}, {$push:{friends:curruser}}).exec(function(err, documents){
            res.send("You now are friends with: " + req.body.user);
        });
      });
    }
    else{
      res.send("Please enter a valid username");
    }
  });
})

//creates new post
router.post('/new-post', function(req, res){
  if(req.body.track != undefined){
    Post.create({username:curruser, message:req.body.message, track:req.body.track})
    res.send("Post created!");
  }
  else if (req.body.playlist != undefined){
    Post.create({username:curruser, message:req.body.message, playlist:req.body.playlist})
    res.send("Post created!");
  }
  else {
    res.send("Please enter either a track or playlist");
  }
})

//deletes post given the posts id
router.delete('/post', function(req, res){
  Post.find({_id:req.body.id}).exec(function(err, docs){
      if(docs.length != 0){
        Post.remove({_id:req.body.id});
        res.send("Post removed!");
      }
      else{
        res.send("Please enter a valid post id");
      }
    })
});

server.listen(process.env.PORT || 3000, process.env.IP || "0.0.0.0", function(){
  var addr = server.address();
  console.log("Server listening at", addr.address + ":" + addr.port);
});