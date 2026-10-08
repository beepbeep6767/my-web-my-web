import React from 'react';
import { createRoot } from 'react-dom/client';
import SchoolAccess from '../components/SchoolAccess.jsx';
import '../styles.css';
import './admin.css';
createRoot(document.getElementById('root')).render(<React.StrictMode><SchoolAccess admin/></React.StrictMode>);
