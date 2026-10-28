export const VERSION = '2.2.0';

// Firebase web config. These values are public by design; what protects your data is
// database.rules.json (deploy it!) plus, ideally, App Check and an API-key restriction.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD2OWGUWuNqbSKq7RQgA4gCpm37Bqqoevo',
  authDomain: 'math-games-ca70d.firebaseapp.com',
  projectId: 'math-games-ca70d',
  storageBucket: 'math-games-ca70d.appspot.com',
  messagingSenderId: '996248715280',
  appId: '1:996248715280:web:bdceac7bfc35d46cccca95',
  databaseURL: 'https://math-games-ca70d-default-rtdb.firebaseio.com/',
};
export const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/10.13.1';

export const MODES = ['mix', 'add', 'sub', 'mul', 'div'];
export const MODE_NAME = { mix: 'Mixed', add: 'Addition', sub: 'Subtraction', mul: 'Multiplication', div: 'Division' };
export const MODE_SIGN = { mix: 'MIX', add: '+', sub: '−', mul: '×', div: '÷' };

export const THEMES = [
  ['green', 'Neon'], ['blue', 'Ocean'], ['red', 'Ruby'], ['yellow', 'Sun'],
  ['purple', 'Grape'], ['light', 'Light'], ['dark', 'Mono'], ['colorblind', 'Color-safe'],
];
export const MUSIC = [['none', 'Off'], ['campfire', 'Campfire'], ['rain', 'Rain'], ['wildlife', 'Wildlife']];
