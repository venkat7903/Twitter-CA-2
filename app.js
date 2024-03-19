const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server is running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const convertToCamelCase = (data) => ({
  userId: data.user_id,
  name: data.name,
  username: data.username,
  password: data.password,
  gender: data.password,
  followerId: data.follower_id,
  followerUserId: data.follower_user_id,
  followingUserId: data.following_user_id,
  tweetId: data.tweet_id,
  tweet: data.tweet,
  dateTime: data.date_time,
  replyId: data.reply_id,
  reply: data.reply,
  likeId: data.like_id,
});

const authenticationToken = (request, response, next) => {
  const authHeader = request.headers["authorization"];
  let jwtToken;

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "SECRET", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.payload = payload;
        next();
      }
    });
  }
};

//API 1
app.post("/register/", async (request, response) => {
  const { username, password, gender, name } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `
  SELECT * FROM user WHERE username='${username}';
  `;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `
      INSERT INTO user (username, password, gender, name)
      VALUES ('${username}', '${hashedPassword}', '${gender}', '${name}');
      `;
      await db.run(createUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
  SELECT * FROM user WHERE username='${username}';
  `;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatch = await bcrypt.compare(password, dbUser.password);

    if (isPasswordMatch === true) {
      const jwtToken = jwt.sign(dbUser, "SECRET");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API3
app.get("/user/tweets/feed", authenticationToken, async (request, response) => {
  const { payload } = request;
  const { user_id, username } = payload;
  console.log(user_id, username);
  const getTweetsQuery = `
    SELECT 
        username,
        tweet,
        date_time
    FROM 
        user
    NATURAL JOIN
        tweet 
    WHERE 
        user_id IN (
            SELECT following_user_id 
            FROM follower
            WHERE follower_user_id=${user_id}
        )
    ORDER BY 
            date_time DESC
    LIMIT 4;
    `;
  const tweetsArray = await db.all(getTweetsQuery);
  response.send(tweetsArray.map((each) => convertToCamelCase(each)));
});

//API4
app.get("/user/following/", authenticationToken, async (request, response) => {
  const { user_id } = request.payload;
  const getFollowersQuery = `
  SELECT user.name
  FROM 
    user 
    INNER JOIN follower ON user.user_id=follower.following_user_id
  WHERE 
    follower_user_id=${user_id};
  `;
  const followersList = await db.all(getFollowersQuery);
  response.send(followersList);
});

//API5
app.get("/user/followers/", authenticationToken, async (request, response) => {
  const { user_id } = request.payload;
  const getFollowers = `
    SELECT user.name
    FROM 
        user
        INNER JOIN follower ON user.user_id=follower.follower_user_id
    WHERE 
        follower.following_user_id=${user_id};
    `;
  const userFollowersList = await db.all(getFollowers);
  response.send(userFollowersList);
});

//API6
app.get("/tweets/:tweetId/", authenticationToken, async (request, response) => {
  const { tweetId } = request.params;
  const { user_id } = request.payload;
  const getTweetIdQuery = `
  SELECT tweet_id
  FROM 
    tweet
    INNER JOIN follower ON tweet.user_id=follower.following_user_id
  WHERE 
    follower.follower_user_id=${user_id};
  `;
  let tweetIdList = await db.all(getTweetIdQuery);
  tweetIdList = tweetIdList.map((each) => each.tweet_id);
  if (tweetIdList.includes(parseInt(tweetId))) {
    const getTweetQuery = `
      SELECT 
        tweet.tweet, 
        COUNT(DISTINCT(like_id)) AS likes,
        COUNT(DISTINCT(reply_id)) AS replies,
        tweet.date_time AS dateTime
      FROM 
        tweet 
        INNER JOIN reply ON tweet.tweet_id=reply.tweet_id
        INNER JOIN like ON tweet.tweet_id=like.tweet_id
      WHERE 
        tweet.tweet_id=${tweetId}
      GROUP BY
        tweet.tweet_id;
      `;
    const tweet = await db.get(getTweetQuery);
    response.send(tweet);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API7
app.get(
  "/tweets/:tweetId/likes/",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { user_id } = request.payload;
    const getTweetIdQuery = `
  SELECT tweet_id
  FROM 
    tweet
    INNER JOIN follower ON tweet.user_id=follower.following_user_id
  WHERE 
    follower.follower_user_id=${user_id};
  `;
    let tweetIdList = await db.all(getTweetIdQuery);
    tweetIdList = tweetIdList.map((each) => each.tweet_id);
    if (tweetIdList.includes(parseInt(tweetId))) {
      const likedQuery = `
        SELECT username
        FROM 
            user
            NATURAL JOIN like
        WHERE 
            tweet_id=${tweetId};
        `;
      let usernameList = await db.all(likedQuery);
      usernameList = usernameList.map((each) => each.username);
      response.send({ likes: usernameList });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API8
app.get(
  "/tweets/:tweetId/replies/",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { user_id } = request.payload;
    const getTweetIdQuery = `
    SELECT tweet_id 
    FROM tweet
        INNER JOIN follower ON tweet.user_id=follower.following_user_id
    WHERE 
        follower.follower_user_id=${user_id};
    `;
    let tweetIdList = await db.all(getTweetIdQuery);
    tweetIdList = tweetIdList.map((each) => each.tweet_id);

    if (tweetIdList.includes(parseInt(tweetId))) {
      const getRepliesQuery = `
        SELECT name, reply
        FROM 
            user
            NATURAL JOIN reply
        WHERE 
            tweet_id=${tweetId};
        `;
      const repliesList = await db.all(getRepliesQuery);
      response.send({ replies: repliesList });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API9
app.get("/user/tweets/", authenticationToken, async (request, response) => {
  const { user_id } = request.payload;
  const getTweetsQuery = `
  SELECT 
    tweet,
    COUNT(DISTINCT(like_id)) AS likes,
    COUNT(DISTINCT(reply_id)) AS replies,
    tweet.date_time AS dateTime
  FROM 
    tweet
    INNER JOIN like ON tweet.tweet_id=like.tweet_id
    INNER JOIN reply ON tweet.tweet_id=reply.tweet_id
  WHERE 
    tweet.user_id=${user_id}
  GROUP BY 
    tweet.tweet_id;
  `;
  const tweetsList = await db.all(getTweetsQuery);
  response.send(tweetsList);
});

//API10
app.post("/user/tweets/", authenticationToken, async (request, response) => {
  const { tweet } = request.body;

  const createTweet = `
    INSERT INTO 
    tweet(tweet)
    VALUES (
        '${tweet}'
    );
    `;

  await db.run(createTweet);
  response.send("Created a Tweet");
});

//API11
app.delete(
  "/tweets/:tweetId/",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { user_id } = request.payload;
    const getTweetIdQuery = `
    SELECT tweet_id
    FROM tweet
    WHERE 
        user_id=${user_id};
    `;
    let tweetIdList = await db.all(getTweetIdQuery);
    tweetIdList = tweetIdList.map((each) => each.tweet_id);

    if (tweetIdList.includes(parseInt(tweetId))) {
      const deleteTweetQuery = `
        DELETE 
            FROM tweet
        WHERE 
            tweet_id=${tweetId};
        `;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
