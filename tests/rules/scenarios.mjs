// Security-rule scenarios, written once as data. Two runners execute them:
//   rules.test.mjs     - the Targaryen rules simulator (runs anywhere with Node)
//   emulator.test.mjs  - the real Firebase Emulator Suite (needs Java + firebase-tools; see README.md)
// Each scenario: who (a uid, or null for signed out), what (set / remove / update / read) and whether it must be allowed.

const day = '2026-01-01';
const stats = { best: { mix: 1, add: 0, sub: 0, mul: 0, div: 0 }, blitzGames: 1, correct: 1, wrong: 0, bestStreak: 1, bestLevel: 1, seconds: 10, dailies: 1, dailyStreak: 1 };

// A (Alice) is the player under test. B is her friend, C sent her a request, D received one from her, E is a stranger.
export const seed = {
  usernames: { alice: 'A', bob: 'B', carol: 'C', dan: 'D', eve: 'E' },
  users: { A: { profile: { xp: 5 } }, B: { profile: { xp: 9 } } },
  publicProfiles: { A: { name: 'Alice', theme: 'green', stats }, B: { name: 'Bob', theme: 'blue', stats } },
  leaderboard: { mix: { A: { name: 'Alice', score: 100 }, B: { name: 'Bob', score: 50 } } },
  friends: { A: { B: 'Bob' }, B: { A: 'Alice' } },
  friendRequests: { A: { C: { name: 'Carol', ts: 5 } }, D: { A: { name: 'Alice', ts: 6 } } },
  friendSent: { C: { A: { name: 'Alice', ts: 5 } }, A: { D: { name: 'Dan', ts: 6 } } },
  dailyResults: { A: { [day]: { name: 'Alice', score: 5, total: 10, ms: 1000, grid: '1111100000' } }, B: { [day]: { name: 'Bob', score: 6, total: 10, ms: 900, grid: '1111110000' } } },
};

const set = (as, path, value, expect, name) => ({ name, as, op: 'set', path, value, expect });
const remove = (as, path, expect, name) => ({ name, as, op: 'remove', path, expect });
const update = (as, updates, expect, name) => ({ name, as, op: 'update', updates, expect });
const read = (as, path, expect, name) => ({ name, as, op: 'read', path, expect });

export const scenarios = [
  // ---- renaming a user who has friends and requests ----
  set('A', '/usernames/alicia', 'A', true, 'rename: claim the new name'),
  remove('A', '/usernames/alice', true, 'rename: release the old name'),
  update('A', { 'leaderboard/mix/A/name': 'Alicia' }, true, 'rename: update own leaderboard name'),
  update('A', { 'friends/B/A': 'Alicia' }, true, 'rename: friend list copy on a friend\'s side'),
  update('A', { 'friendSent/C/A/name': 'Alicia' }, true, 'rename: copy on a request someone sent to you'),
  update('A', { 'friendRequests/D/A/name': 'Alicia' }, true, 'rename: copy on a request you sent'),
  update('A', { [`dailyResults/A/${day}/name`]: 'Alicia' }, true, 'rename: stored Daily result name'),
  update('A', { 'usernames/alicia': 'A', 'friends/B/A': 'Alicia', 'friendSent/C/A/name': 'Alicia', 'friendRequests/D/A/name': 'Alicia', [`dailyResults/A/${day}/name`]: 'Alicia', 'leaderboard/mix/A/name': 'Alicia' }, true, 'rename: everything in one multi-path update'),
  update('A', { 'friends/B/A': 'x' }, false, 'rename: a name that is too short is refused'),
  update('A', { 'leaderboard/mix/A/name': 'a name that is way too long' }, false, 'rename: a name that is too long is refused'),
  // ---- attempts that must fail ----
  update('A', { 'friends/D/A': 'Alicia' }, false, 'the sender of a pending request cannot add herself to the recipient\'s friends'),
  set('A', '/friends/E/A', 'Alicia', false, 'cannot create a friendship in someone else\'s list'),
  set('A', '/friends/A/B', 'Hacked', false, 'cannot rewrite a friend\'s name in your own list'),
  update('A', { 'leaderboard/mix/B/name': 'Hacked' }, false, 'cannot change another player\'s leaderboard entry'),
  set('A', `/dailyResults/B/${day}/score`, 10, false, 'cannot change another player\'s Daily result'),
  set('A', '/publicProfiles/B/name', 'Hacked', false, 'cannot change another player\'s public profile'),
  set('A', '/users/B/profile/xp', 1, false, 'cannot change another player\'s private profile'),
  update('A', { 'friendSent/C/D/name': 'Hacked' }, false, 'cannot touch a request between two other people'),
  set('E', '/friendSent/C/A/name', 'Hacked', false, 'a stranger cannot edit a request'),
  set('A', '/friendSent/C/A/extra', 1, false, 'request records accept no extra fields'),
  set('A', '/friendSent/X/A', { name: 'Alicia', ts: 1 }, false, 'cannot invent a request as its recipient'),
  set('A', '/friendRequests/E/B', { name: 'Bob', ts: 1 }, false, 'cannot send a request in someone else\'s name'),
  set('A', '/friendRequests/A/A', { name: 'Alice', ts: 1 }, false, 'cannot send a request to yourself'),
  // ---- username claims ----
  set('A', '/usernames/bob', 'A', false, 'cannot take over another player\'s username'),
  remove('A', '/usernames/bob', false, 'cannot release another player\'s username'),
  set('A', '/usernames/freshname', 'B', false, 'cannot claim a name on behalf of somebody else'),
  set('A', '/usernames/freshname', 'A', true, 'can claim a free name for yourself'),
  set(null, '/usernames/freshname', 'A', false, 'a signed-out client cannot claim a name'),
  // ---- friends flow ----
  update('A', { 'friendRequests/E/A': { name: 'Alice', ts: 7 }, 'friendSent/A/E': { name: 'Eve', ts: 7 } }, true, 'send a friend request'),
  update('A', { 'friendRequests/D/A': null, 'friendSent/A/D': null }, true, 'cancel a request you sent'),
  update('A', { 'friends/A/C': 'Carol', 'friends/C/A': 'Alice', 'friendRequests/A/C': null, 'friendSent/C/A': null }, true, 'accept a request'),
  update('A', { 'friendRequests/A/C': null, 'friendSent/C/A': null }, true, 'decline a request'),
  update('A', { 'friends/A/B': null, 'friends/B/A': null }, true, 'remove a friend (both sides)'),
  update('A', { 'friends/A/E': 'Eve', 'friends/E/A': 'Alice' }, false, 'cannot become friends without a request'),
  update('A', { 'friendRequests/D/A': null }, true, 'the sender can withdraw a request'),
  // ---- reading ----
  read('A', '/friends/A', true, 'you can read your own friends'),
  read('A', '/friends/B', false, 'you cannot read somebody else\'s friends'),
  read('A', '/friendRequests/B', false, 'you cannot read somebody else\'s requests'),
  read('A', '/users/B', false, 'you cannot read somebody else\'s private profile'),
  read('B', `/dailyResults/A/${day}`, true, 'a friend can read your Daily result'),
  read('E', `/dailyResults/A/${day}`, false, 'a stranger cannot read your Daily result'),
  read('A', `/dailyResults/A/${day}`, true, 'you can read your own Daily result'),
  read(null, '/publicProfiles/A', true, 'public profiles are public'),
  read(null, '/leaderboard/mix', true, 'the leaderboard is public'),
  // ---- deleting an account ----
  update('A', {
    'users/A': null, 'publicProfiles/A': null, 'dailyResults/A/2026-01-01': null, 'leaderboard/mix/A': null, 'usernames/alice': null,
    'friends/A/B': null, 'friends/B/A': null, 'friendRequests/A/C': null, 'friendSent/C/A': null, 'friendSent/A/D': null, 'friendRequests/D/A': null,
  }, true, 'delete account: remove every record entry by entry, including the other side of each friendship and request'),
  update('A', { 'friends/A': null }, false, 'delete account: the old way (wiping a whole node at once) is refused, so the app deletes entry by entry'),
  update('A', { 'dailyResults/A': null }, false, 'delete account: wiping the whole Daily node at once is refused too'),
  update('A', { 'friends/B': null }, false, 'delete account: cannot wipe a friend\'s whole list'),
  update('A', { 'leaderboard/mix/B': null }, false, 'delete account: cannot delete another player\'s leaderboard entry'),
  update('A', { 'users/B': null }, false, 'delete account: cannot delete another player\'s profile'),
  // ---- the picture / level / title / frame fields ----
  set('A', '/leaderboard/mix/A/frame', 'neon', true, 'a valid frame can be stored'),
  set('A', '/leaderboard/mix/A/frame', 'hacked', false, 'an unknown frame is refused'),
  set('A', '/publicProfiles/A/frame', 'frost', true, 'a valid frame on the public profile'),
  set('A', '/leaderboard/mix/A/card', 'crystal', true, 'a valid profile card can be stored'),
  set('A', '/leaderboard/mix/A/card', 'hacked', false, 'an unknown profile card is refused'),
  set('A', '/publicProfiles/A/card', 'snowdrift', true, 'a valid profile card on the public profile'),
  set('A', '/publicProfiles/A/card', 'neon', false, 'a frame id is not a profile card'),
  set('A', '/publicProfiles/A/frame', 'sugar', true, 'the Sugar Rush frame on the public profile'),
  set('A', '/publicProfiles/A/frame', 'bone', true, 'the Bone Crown frame on the public profile'),
  set('A', '/publicProfiles/A/card', 'sprinkle', true, 'the Sprinkle Pop card on the public profile'),
  set('A', '/publicProfiles/A/card', 'crypt', true, 'the Crypt Keeper card on the public profile'),
  set('A', '/publicProfiles/A/frame', 'gold', false, 'the retired Gold Rush frame is no longer accepted'),
  set('A', '/publicProfiles/A/card', 'goldledger', false, 'the retired Gold Ledger card is no longer accepted'),
  set('A', '/publicProfiles/A/theme', 'notebook', true, 'the Notebook theme on the public profile'),
  set('A', '/publicProfiles/A/theme', 'space', true, 'the Space theme on the public profile'),
  set('A', '/publicProfiles/A/theme', 'winter', true, 'the Winter theme on the public profile'),
  set('A', '/publicProfiles/A/theme', 'candy', true, 'the Candy theme on the public profile'),
  set('A', '/publicProfiles/A/theme', 'gothic', true, 'the Gothic theme on the public profile'),
  set('A', '/publicProfiles/A/theme', 'rainbow', false, 'an unknown theme is refused'),
  set('A', '/publicProfiles/A/ach', { adder: 4, streaker: 1 }, true, 'achievements on the public profile'),
  set('A', '/publicProfiles/A/ach', { adder: 5 }, false, 'an achievement tier above Platinum is refused'),
  set('A', '/publicProfiles/A/ach', { adder: 0 }, false, 'an achievement at tier 0 is refused'),
  set('A', '/publicProfiles/A/ach', { 'bad id': 1 }, false, 'an achievement id must be lowercase letters'),
  set('A', '/publicProfiles/A/showcase', 'adder,streaker,collector', true, 'three pinned achievements'),
  set('A', '/publicProfiles/A/showcase', 'adder,streaker,collector,polymath', false, 'four pinned achievements are refused'),
  set('A', '/publicProfiles/A/achTitle', 'polymath', true, 'an achievement title on the public profile'),
  set('A', '/publicProfiles/A/achTitle', 'The Adder', false, 'the achievement title is an id, not free text'),
  set('B', '/publicProfiles/A/ach', { adder: 1 }, false, 'cannot give another player an achievement'),
];
