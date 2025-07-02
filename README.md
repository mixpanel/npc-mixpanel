# NPC Mixpanel 🎭

> **Generate realistic user behavior data for any website**

A web automation service that creates authentic analytics data by simulating real human interactions. Built on the belief that **you should be able to generate good custom test data for any arbitrary website**.

## 🎯 Why This Matters

Most analytics testing uses fake data or simplistic bots that don't behave like real users. This creates blind spots where your analytics work with test data but fail with real users.

**NPC Mixpanel** generates realistic user sessions with:
- Natural mouse movements and scrolling patterns
- Context-aware interactions based on page content  
- Persona-driven behaviors that reflect different user types
- Human-like timing and decision patterns

The result: test data that actually reflects how real users behave on your site.

## ✨ Key Features

- **Intelligent Behavior**: Persona-based users with realistic interaction patterns
- **Real-Time Monitoring**: Live WebSocket updates with detailed logging
- **Anti-Detection**: Stealth techniques for authentic browser sessions
- **Cloud-Ready**: Deploy to Google Cloud Run with automatic scaling

## 🚀 Quick Start

### Local Development

1. **Clone and Install**
```bash
git clone <your-repo-url>
cd npc-mixpanel
npm install
```

2. **Environment Setup**
```bash
# Create .env file
echo "NODE_ENV=dev" > .env
echo "MIXPANEL_TOKEN=your_mixpanel_token" >> .env
echo "SERVICE_NAME=npc-mixpanel" >> .env
```

3. **Run Locally**
```bash
npm run local
```

4. **Open the Interface**
Navigate to `http://localhost:8080` and start your first simulation!

### Cloud Deployment

```bash
# Deploy to Google Cloud Run
npm run deploy
```

## 🎨 User Interface

The web interface provides an intuitive way to configure and monitor your simulations:

- **Target URL**: The website you want to test
- **Number of Users**: 1-25 simulated users per session
- **Behavior Settings**: Headless mode, Mixpanel injection, historical timestamps
- **Real-Time Terminal**: Live updates with color-coded status messages
- **Session Results**: Detailed summaries of user interactions

## 🔧 API Usage

### Programmatic Access

```javascript
import main from './headless.js';

// Basic simulation
const results = await main({
  url: 'https://your-website.com',
  users: 10,
  concurrency: 3,
  headless: true,
  inject: true
});

// Advanced configuration
const results = await main({
  url: 'https://your-website.com',
  users: 15,
  concurrency: 5,
  headless: false,        // Watch the automation
  inject: true,           // Inject Mixpanel tracking
  past: true,            // Use historical timestamps
  token: 'your_token',   // Custom Mixpanel token
  maxActions: 20         // Limit actions per user
});
```

### Simulation Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | Demo site | Target website URL |
| `users` | number | 10 | Number of users to simulate (1-25) |
| `concurrency` | number | 5 | Concurrent users (1-10) |
| `headless` | boolean | true | Run browsers in headless mode |
| `inject` | boolean | true | Inject Mixpanel tracking |
| `past` | boolean | false | Use historical timestamps |
| `token` | string | - | Custom Mixpanel project token |
| `maxActions` | number | null | Maximum actions per user |

## 🔒 Responsible Use

**For legitimate testing only:**
- ✅ Test your own websites and applications
- ✅ Generate realistic analytics data for development
- ✅ Validate user experience flows

**Not for:**
- 🚫 Load testing or overwhelming servers
- 🚫 Sites you don't own without permission
- 🚫 Circumventing rate limits or security measures

## 🧪 Testing

```bash
npm test              # Run full test suite
npm run test:headless # Test automation functions
```

## 📝 License

ISC License - Feel free to use this for your testing and development needs.

---
