const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
const dbPath = path.join(__dirname, "twitterClone.db");
app.use(express.json());

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

//Register API 1
app.post("/register/", async (request, response) => {
  const userDetails = request.body;
  const { username, password, name, gender } = userDetails;
  const getDbUSer = `
  SELECT *
  FROM user
  WHERE username LIKE '${username}';`;
  const dbUser = await db.get(getDbUSer);
  if (dbUser === undefined) {
    const passwordLength = password.length;
    if (passwordLength < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const addUserQuery = `
      INSERT INTO user(name, username, password, gender)
      VALUES
       ('${name}',
        '${username}',
        '${hashedPassword}',
        '${gender}');`;
      await db.run(addUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//Login API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getDbUSer = `
  SELECT *
  FROM user
  WHERE username LIKE '${username}';`;
  const dbUser = await db.get(getDbUSer);
  if (dbUser !== undefined) {
    const isPasswordSame = await bcrypt.compare(password, dbUser.password);
    if (isPasswordSame) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "abcxyz");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
    console.log(isPasswordSame);
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "abcxyz", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

// Get Tweet Feed API 3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserDetailsQuery = `
  SELECT 
    *
  FROM user
  WHERE
    user.username LIKE '${username}';`;
  const userDetails = await db.get(getUserDetailsQuery);

  const getTweetFeedsQuery = `
  SELECT 
    user.username,
    tweet.tweet,
    tweet.date_time AS dateTime
  FROM (follower INNER JOIN user
    ON follower.following_user_id = user.user_id)
    INNER JOIN tweet
    ON user.user_id = tweet.user_id
  WHERE
    follower.follower_user_id = ${userDetails.user_id}
  ORDER BY tweet.date_time DESC
  LIMIT 4;`;
  const tweetFeedsArray = await db.all(getTweetFeedsQuery);
  response.send(tweetFeedsArray);
});

//following Names API 4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserDetailsQuery = `
  SELECT 
    *
  FROM user
  WHERE
    user.username LIKE '${username}';`;
  const userDetails = await db.get(getUserDetailsQuery);

  const getFollowingNamesQuery = `
  SELECT 
    user.name
  FROM follower INNER JOIN user
    ON follower.following_user_id = user.user_id
  WHERE
    follower.follower_user_id = ${userDetails.user_id};`;
  const followingNamesArray = await db.all(getFollowingNamesQuery);
  response.send(followingNamesArray);
});

//followers Names API 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserDetailsQuery = `
  SELECT 
    *
  FROM user
  WHERE
    user.username LIKE '${username}';`;
  const userDetails = await db.get(getUserDetailsQuery);

  const getFollowerNamesQuery = `
  SELECT 
    user.name
  FROM follower INNER JOIN user
    ON follower.follower_user_id = user.user_id
  WHERE
    follower.following_user_id = ${userDetails.user_id};`;
  const followerNamesArray = await db.all(getFollowerNamesQuery);
  response.send(followerNamesArray);
});

//Get Tweet API 6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getUserDetailsQuery = `
  SELECT 
    *
  FROM user
  WHERE
    user.username LIKE '${username}';`;
  const userDetails = await db.get(getUserDetailsQuery);

  const getFollowingTweetQuery = `
  SELECT *
  FROM follower INNER JOIN tweet
  ON follower.following_user_id = tweet.user_id
  WHERE
    follower.follower_user_id = ${userDetails.user_id}
    AND tweet.tweet_id = ${tweetId};`;
  const followingTweet = await db.get(getFollowingTweetQuery);
  if (followingTweet !== undefined) {
    const getTweetDetailsQuery = `
    SELECT
        tweet.tweet,
        COUNT(DISTINCT(like.like_id)) AS likes,
        COUNT(DISTINCT(reply.reply_id)) AS replies,
        tweet.date_time AS dateTime
    FROM (tweet INNER JOIN reply
        ON tweet.tweet_id = reply.tweet_id) INNER JOIN like
        ON tweet.tweet_id = like.tweet_id
    WHERE
        tweet.tweet_id = ${tweetId};`;
    const tweetDetails = await db.get(getTweetDetailsQuery);
    response.send(tweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//Get Tweets Like API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserDetailsQuery = `
    SELECT 
        *
    FROM user
    WHERE
        user.username LIKE '${username}';`;
    const userDetails = await db.get(getUserDetailsQuery);

    const getFollowingTweetQuery = `
    SELECT *
    FROM follower INNER JOIN tweet
    ON follower.following_user_id = tweet.user_id
    WHERE
        follower.follower_user_id = ${userDetails.user_id}
    AND tweet.tweet_id = ${tweetId};`;
    const followingTweet = await db.get(getFollowingTweetQuery);

    if (followingTweet !== undefined) {
      const getTweetLikesQuery = `
        SELECT
            user.username
        FROM like INNER JOIN user
            ON like.user_id = user.user_id
        WHERE
            like.tweet_id = ${tweetId};`;
      const tweetLikes = await db.all(getTweetLikesQuery);
      response.send({
        likes: tweetLikes.map((eachNameObj) => {
          return eachNameObj.username;
        }),
      });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//Get Tweets Reply API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserDetailsQuery = `
    SELECT 
        *
    FROM user
    WHERE
        user.username LIKE '${username}';`;
    const userDetails = await db.get(getUserDetailsQuery);

    const getFollowingTweetQuery = `
    SELECT *
    FROM follower INNER JOIN tweet
    ON follower.following_user_id = tweet.user_id
    WHERE
        follower.follower_user_id = ${userDetails.user_id}
    AND tweet.tweet_id = ${tweetId};`;
    const followingTweet = await db.get(getFollowingTweetQuery);

    if (followingTweet !== undefined) {
      const getTweetRepliesQuery = `
        SELECT
            user.name,
            reply.reply
        FROM reply INNER JOIN user
            ON reply.user_id = user.user_id
        WHERE
            reply.tweet_id = ${tweetId};`;
      const tweetReplies = await db.all(getTweetRepliesQuery);
      response.send({
        replies: tweetReplies,
      });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//Get User Tweets API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserDetailsQuery = `
  SELECT 
    *
  FROM user
  WHERE
    user.username LIKE '${username}';`;
  const userDetails = await db.get(getUserDetailsQuery);

  const getUserTweetDetailsQuery = `
    SELECT
        tweet.tweet,
        COUNT(DISTINCT(like.like_id)) AS likes,
        COUNT(DISTINCT(reply.reply_id)) AS replies,
        tweet.date_time AS dateTime
    FROM (tweet INNER JOIN reply
        ON tweet.tweet_id = reply.tweet_id) INNER JOIN like
        ON tweet.tweet_id = like.tweet_id
    WHERE
        tweet.user_id = ${userDetails.user_id}
    GROUP BY
        tweet.tweet_id;`;
  const userTweetDetails = await db.all(getUserTweetDetailsQuery);
  response.send(userTweetDetails);
});

//Create Tweet API 10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const tweetDetails = request.body;
  const { tweet } = tweetDetails;
  const postTweetQuery = `
    INSERT INTO tweet(tweet)
    VALUES('${tweet}');`;
  const dbResponse = await db.run(postTweetQuery);
  response.send("Created a Tweet");
});

//Delete Tweet API 11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserDetailsQuery = `
    SELECT 
        *
    FROM user
    WHERE
        user.username LIKE '${username}';`;
    const userDetails = await db.get(getUserDetailsQuery);

    const getUserTweetQuery = `
    SELECT *
    FROM user INNER JOIN tweet
    ON user.user_id = tweet.user_id
    WHERE user.user_id = ${userDetails.user_id}
        AND tweet.tweet_id = ${tweetId};`;
    const userTweet = await db.get(getUserTweetQuery);
    if (userTweet !== undefined) {
      const deleteTweetQuery = `
      DELETE FROM tweet
      WHERE tweet.tweet_id = ${tweetId};`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
