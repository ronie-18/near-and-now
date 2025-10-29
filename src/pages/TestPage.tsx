import React from 'react';

const TestPage = () => {
  return (
    <div style={{
      padding: '40px',
      fontFamily: 'Arial, sans-serif',
      maxWidth: '800px',
      margin: '0 auto'
    }}>
      <h1 style={{ color: '#16a34a' }}>✅ React App is Working!</h1>
      <p>If you can see this page, your React application is successfully deployed and running.</p>
      
      <div style={{
        background: '#f0fdf4',
        border: '1px solid #16a34a',
        borderRadius: '8px',
        padding: '20px',
        marginTop: '20px'
      }}>
        <h2>Deployment Status: SUCCESS</h2>
        <ul>
          <li>✅ HTML loaded</li>
          <li>✅ JavaScript bundle loaded</li>
          <li>✅ React mounted</li>
          <li>✅ React Router working</li>
        </ul>
      </div>

      <div style={{ marginTop: '30px' }}>
        <a href="/" style={{
          display: 'inline-block',
          padding: '12px 24px',
          background: '#16a34a',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '6px',
          fontWeight: 'bold'
        }}>
          Go to Home Page →
        </a>
      </div>
    </div>
  );
};

export default TestPage;

