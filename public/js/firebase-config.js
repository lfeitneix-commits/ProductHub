/*
 * Configuración web de Firebase. Vacía = el Hub funciona sin base externa:
 * lee las fichas de public/data y los one pagers de public/onepagers (prototipo).
 * Lo que se edita o se anota queda solo en esa pestaña hasta recargar.
 *
 * Para conectar Firebase más adelante (ver README), completar con los valores del proyecto:
 *   apiKey: "AIzaSyBKWqmGM4Ma1Zi6l5Sn10nWJeCI9C7_4NI",
 *   authDomain: "product-hub-a1b33.firebaseapp.com",
 *   projectId: "product-hub-a1b33",
 *   storageBucket: "product-hub-a1b33.firebasestorage.app",
 *   messagingSenderId: "918509178468",
 *   appId: "1:918509178468:web:8efb2263decad38e5f5971",
 */
window.NEIX_FIREBASE = {};

// Solo pueden entrar cuentas de este dominio (cuando Firebase esté conectado).
window.NEIX_DOMINIO = "neix.com.ar";
