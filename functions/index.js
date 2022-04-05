const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.initializeApp(functions.config().firebase).database();

async function validateToken(req, res) {
  if ((!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) &&
      !(req.cookies && req.cookies.__session)) {
    res.status(403).send('Unauthorized');
    return false;
  }

  let idToken;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    idToken = req.headers.authorization.split('Bearer ')[1];
  } else if(req.cookies) {
    idToken = req.cookies.__session;
  } else {
    res.status(403).send('Unauthorized');
    return false;
  }

  try {
    const decodedIdToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedIdToken;
    return true;
  } catch (error) {
    res.status(403).send('Unauthorized');
    return false;
  }
}

exports.createInvite = functions.https.onRequest(async (req, res) => {
  if (!req.query.listID) {
    res.status(400).send("No listID query provided.");
    return;
  }
  if (validateToken(req, res)) {
    const group = (await db.ref(`/groups/${req.query.listID}`).once('value'));
    if (group.child('members').child(req.user.uid).exists()) {
      const inviteData = Math.random().toString(36).slice(2);

      await db.ref(`/invites/${inviteData}`).set({
        groupId: req.query.listID,
        expiration: Date.now() + 86400000
      });

      res.status(200).send(inviteData);
      return;
    } else {
      res.status(403).send('Unauthorized');
      return;
    }
  }
});

exports.joinInvite = functions.https.onRequest(async (req, res) => {
  if (!validateToken(req, res)) {
    res.status(403).send('Unauthorized');
    return;
  }

  const invite = await db.ref(`/invites/${req.query.inviteId}`).once('value');
  if (!invite.exists()) {
    res.status(404).send('Invite does not exist.');
    return;
  }
  
  const groupId = invite.child('groupId').val();
  if (!groupId) {
    res.status(500).send('Invite does not have group.');
    return;
  }

  await db.ref(`/groups/${groupId}/members/${req.user.uid}`).set(true);

  await db.ref(`/users/${req.user.uid}/groups/${groupId}`).set(true);

  res.status(200).send('Successfully added to group.');
});

exports.newUser = functions.auth.user().onCreate(async (user) => {
  await db.ref(`/users/${user.uid}/email`).set(user.email);
});

exports.deleteUser = functions.auth.user().onDelete(async (user) => {
  await db.ref(`/users/${user.uid}`).remove();
});