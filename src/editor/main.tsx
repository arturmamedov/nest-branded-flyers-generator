import { createRoot } from 'react-dom/client';
import '@fontsource/montserrat/500.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import './editor.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);
