import React from 'react';
import {createRoot} from 'react-dom/client';
import '@fontsource-variable/manrope';
import '@fontsource-variable/dm-sans';
import '@fontsource/playfair-display/600.css';
import './style.css';
import App from './App.jsx';
createRoot(document.getElementById('root')).render(<App/>);
if ('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
