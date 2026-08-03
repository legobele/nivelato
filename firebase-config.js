// firebase-config.js — Nivelato Firebase setup
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDLOcT2LkztypbqUNmAX6dEdNW9INMxkVw",
  authDomain: "nivelato-app.firebaseapp.com",
  projectId: "nivelato-app",
  storageBucket: "nivelato-app.firebasestorage.app",
  messagingSenderId: "759893408531",
  appId: "1:759893408531:web:696e2da5f004a3bac5f8e6",
  measurementId: "G-J4SF3YMPEK"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
