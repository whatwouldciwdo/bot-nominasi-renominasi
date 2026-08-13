import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import EmailDetailPage from './pages/EmailDetailPage';
import HistoryPage from './pages/HistoryPage';
import './styles.css';

const detailMatch = window.location.pathname.match(/^\/dashboard\/email\/([a-f0-9]{24})\/?$/i);
const historyMatch = window.location.pathname.match(/^\/dashboard\/history\/(replies|emails)\/?$/i);
const Page = detailMatch
  ? () => <EmailDetailPage emailId={detailMatch[1]} />
  : historyMatch
    ? () => <HistoryPage type={historyMatch[1].toLowerCase()} />
    : App;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><Page /></React.StrictMode>,
);