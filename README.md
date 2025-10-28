# NPC Mixpanel 🎭

> **Generate realistic user behavior data for any website**

A web automation service that creates authentic analytics data by simulating real human interactions. Also, it injects Mixpanel!

**NPC Mixpanel** generates realistic user sessions with:

- Natural mouse movements and scrolling patterns
- Context-aware interactions based on page content
- Persona-driven behaviors that reflect different user types
- Human-like timing and decision patterns

The result: test data that actually reflects how autocaptured data in Mixpanel would look, making it perfect for demos, testing, and validation.

## ✨ Key Features

- **Intelligent Behavior**: Persona-based users with realistic interaction patterns
- **Real-Time Monitoring**: Live WebSocket updates with detailed logging
- **Anti-Detection**: Stealth techniques for authentic browser sessions
- **Cloud-Ready**: Deploy to Google Cloud Run with automatic scaling

## 🚀 Quick Start

### Use it in production:

**[https://meeple.mixpanel.org](https://meeple.mixpanel.org)**
_(you will need to be logged in via Okta)_

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
	headless: false, // Watch the automation
	inject: true, // Inject Mixpanel tracking
	past: true, // Use historical timestamps
	token: 'your_token', // Custom Mixpanel token
	maxActions: 20 // Limit actions per user
});
```

### Simulation Parameters

| Parameter     | Type    | Default   | Description                        |
| ------------- | ------- | --------- | ---------------------------------- |
| `url`         | string  | Demo site | Target website URL                 |
| `users`       | number  | 10        | Number of users to simulate (1-25) |
| `concurrency` | number  | 5         | Concurrent users (1-10)            |
| `headless`    | boolean | true      | Run browsers in headless mode      |
| `inject`      | boolean | true      | Inject Mixpanel tracking           |
| `past`        | boolean | false     | Use historical timestamps          |
| `token`       | string  | -         | Custom Mixpanel project token      |
| `maxActions`  | number  | null      | Maximum actions per user           |

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

# Deterministic Sequences API

The npc-mixpanel automation system supports deterministic sequence execution for creating reproducible user journeys and funnels. This document provides comprehensive guidance on using the sequences feature.

## Quick Start

Send a POST request to `/simulate` with a `sequences` parameter:

```bash
curl -X POST http://localhost:3000/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-website.com",
    "users": 5,
    "sequences": {
      "checkout-flow": {
        "description": "Complete purchase with coupon",
        "temperature": 7,
        "actions": [
          {"action": "click", "selector": "#product"},
          {"action": "click", "selector": "#addToCart"},
          {"action": "type", "selector": "#coupon", "text": "SAVE20"},
          {"action": "click", "selector": "#checkout"}
        ]
      }
    }
  }'
```

## Sequence Configuration

### Core Parameters

- **`description`** (optional): Human-readable description
- **`temperature`** (0-10): Controls sequence adherence
- **`chaos-range`** (optional): `[min, max]` multiplier for variability
- **`actions`** (required): Array of actions to perform

### Temperature Control

The temperature setting controls how strictly meeples follow the sequence:

- **10**: Strict adherence - follows sequence exactly
- **7-9**: High adherence - mostly follows sequence with minor deviations
- **4-6**: Balanced - mix of sequence and random actions
- **1-3**: Low adherence - mostly random with occasional sequence actions
- **0**: Random - ignores sequence completely

### Chaos Range

Adds run-to-run variability by multiplying temperature by a random value:

```json
{
	"temperature": 5,
	"chaos-range": [0.5, 1.5]
}
```

Effective temperature will be between 2.5 and 7.5 for each run.

## Supported Actions

### Click Action

Clicks on an element identified by CSS selector:

```json
{ "action": "click", "selector": "#elementId" }
```

**Examples:**

```json
{"action": "click", "selector": "button.primary"}
{"action": "click", "selector": "[data-testid='submit']"}
{"action": "click", "selector": ".product-card:first-child"}
```

### Type Action

Types text into an input field:

```json
{ "action": "type", "selector": "#inputField", "text": "Hello World" }
```

**Examples:**

```json
{"action": "type", "selector": "#email", "text": "user@example.com"}
{"action": "type", "selector": "input[name='search']", "text": "product name"}
{"action": "type", "selector": "#message", "text": "This is a test message"}
```

### Select Action

Selects an option from a dropdown:

```json
{ "action": "select", "selector": "#dropdown", "value": "option1" }
```

**Examples:**

```json
{"action": "select", "selector": "#country", "value": "US"}
{"action": "select", "selector": "select[name='shipping']", "value": "express"}
{"action": "select", "selector": "#quantity", "value": "2"}
```

## Human-like Behavior

Sequences include realistic human behaviors:

- **Natural delays**: 500ms-2000ms between actions
- **Mouse movements**: Natural cursor paths with bezier curves
- **Click precision**: Slight randomness in click positions
- **Scrolling**: Automatic scrolling to bring elements into view
- **Micro-movements**: Small cursor adjustments and tremor effects

## Error Handling

The system gracefully handles common issues:

- **Element not found**: Continues to next action after timeout
- **Invalid selectors**: Logs error and proceeds
- **Page navigation**: Adapts to URL changes during sequence
- **Timeout handling**: 5-second timeout per element lookup
- **Consecutive failures**: Stops sequence after 3 consecutive failures

## Use Cases

### E-commerce Funnel Analysis

```json
{
	"sequences": {
		"abandoned-cart": {
			"description": "Add to cart but abandon checkout",
			"temperature": 6,
			"chaos-range": [1, 3],
			"actions": [
				{ "action": "click", "selector": ".product-item" },
				{ "action": "click", "selector": "#add-to-cart" },
				{ "action": "click", "selector": "#cart-icon" },
				{ "action": "click", "selector": "#remove-item" }
			]
		},
		"successful-purchase": {
			"description": "Complete full purchase flow",
			"temperature": 8,
			"actions": [
				{ "action": "click", "selector": ".product-item" },
				{ "action": "click", "selector": "#add-to-cart" },
				{ "action": "click", "selector": "#checkout" },
				{ "action": "type", "selector": "#email", "text": "customer@example.com" },
				{ "action": "type", "selector": "#card", "text": "4111111111111111" },
				{ "action": "click", "selector": "#complete-order" }
			]
		}
	}
}
```

### Form Validation Testing

```json
{
	"sequences": {
		"invalid-email-flow": {
			"description": "Test email validation",
			"temperature": 9,
			"actions": [
				{ "action": "type", "selector": "#email", "text": "invalid-email" },
				{ "action": "click", "selector": "#submit" },
				{ "action": "type", "selector": "#email", "text": "valid@example.com" },
				{ "action": "click", "selector": "#submit" }
			]
		},
		"required-fields": {
			"description": "Test required field validation",
			"temperature": 8,
			"actions": [
				{ "action": "click", "selector": "#submit" },
				{ "action": "type", "selector": "#name", "text": "John Doe" },
				{ "action": "click", "selector": "#submit" },
				{ "action": "type", "selector": "#email", "text": "john@example.com" },
				{ "action": "click", "selector": "#submit" }
			]
		}
	}
}
```

### A/B Testing Scenarios

```json
{
	"sequences": {
		"variant-a-flow": {
			"description": "Test variant A of signup flow",
			"temperature": 7,
			"actions": [
				{ "action": "click", "selector": "#signup-variant-a" },
				{ "action": "type", "selector": "#email", "text": "test@example.com" },
				{ "action": "type", "selector": "#password", "text": "password123" },
				{ "action": "click", "selector": "#create-account" }
			]
		},
		"variant-b-flow": {
			"description": "Test variant B of signup flow",
			"temperature": 7,
			"actions": [
				{ "action": "click", "selector": "#signup-variant-b" },
				{ "action": "type", "selector": "#username", "text": "testuser" },
				{ "action": "type", "selector": "#email", "text": "test@example.com" },
				{ "action": "type", "selector": "#password", "text": "password123" },
				{ "action": "click", "selector": "#register" }
			]
		}
	}
}
```

## Response Format

Successful execution returns detailed results:

```json
{
	"results": [
		{
			"actions": [
				{
					"action": "click",
					"selector": "#product",
					"success": true,
					"duration": 245,
					"timestamp": 1647891234567
				},
				{
					"action": "type",
					"selector": "#email",
					"text": "user@example.com",
					"success": true,
					"duration": 180,
					"timestamp": 1647891234812
				}
			],
			"duration": 12,
			"persona": "researcher",
			"sequence": "checkout-flow",
			"success": true
		}
	]
}
```

### Action Result Properties

- **`action`**: Type of action performed
- **`selector`**: CSS selector used
- **`text`**: Text typed (for type actions)
- **`value`**: Value selected (for select actions)
- **`success`**: Whether action succeeded
- **`error`**: Error message if failed
- **`duration`**: Time taken in milliseconds
- **`timestamp`**: When action was executed

## Validation Errors

Invalid sequences return detailed error messages:

```json
{
	"error": "Invalid sequences specification",
	"details": [
		"Sequence \"test\": Temperature must be a number between 0 and 10",
		"Sequence \"test\": Action 1 has unsupported action type: invalid",
		"Sequence \"test\": Action 2 (type) must have a text field"
	]
}
```

## Integration with Existing Features

### Hot Zone Compatibility

Sequences work seamlessly with hot zone detection:

- When sequence actions fail, system falls back to hot zone targeting
- Hot zones provide intelligent element alternatives
- Visual prominence scoring helps select fallback targets

### Persona Integration

Selected personas influence behavior when temperature allows deviation:

- `researcher`: Longer hover times, more thorough interactions
- `powerUser`: Faster execution, fewer random actions
- `impulse`: Quick decisions, more random clicking

### Analytics Tracking

All sequence actions are tracked in Mixpanel:

- Sequence name and description in event properties
- Action-level tracking with timing data
- Success/failure rates for funnel analysis

### Real-time Monitoring

WebSocket streaming provides live sequence execution updates:

- Each meeple gets dedicated terminal tab
- Real-time action progress and results
- Error logging and retry attempts

## Best Practices

### Selector Strategy

1. **Use stable selectors**: Prefer `data-testid` or `id` attributes
2. **Avoid positional selectors**: Don't rely on `:nth-child()` unless necessary
3. **Test selectors**: Verify selectors work across different page states

### Temperature Tuning

1. **Start high (8-9)**: Begin with strict sequence following
2. **Add variability**: Introduce chaos-range for realistic variation
3. **Lower for exploration**: Use 4-6 for mixed behavior patterns

### Sequence Design

1. **Keep actions atomic**: Each action should be simple and focused
2. **Handle failures gracefully**: Design sequences to continue after failures
3. **Test edge cases**: Include invalid inputs and error scenarios

### Performance Considerations

1. **Limit sequence length**: Keep under 10-15 actions for reliability
2. **Use reasonable delays**: Don't make sequences too fast or slow
3. **Monitor success rates**: Adjust selectors if actions frequently fail

## Troubleshooting

### Common Issues

**Elements not found**:

- Check selector syntax and specificity
- Verify elements exist when action executes
- Consider page load timing issues

**Sequence not followed**:

- Increase temperature value
- Reduce chaos-range
- Check for validation errors

**Actions timing out**:

- Increase element wait timeout
- Check for page navigation during sequence
- Verify elements are interactable

### Debug Mode

Enable detailed logging by checking browser console for:

- Element detection results
- Action execution timing
- Error messages and stack traces

## TypeScript Support

Full TypeScript definitions are available in `index.d.ts`:

```typescript
import { SequenceSpec, MeepleParams } from './index';

const sequence: SequenceSpec = {
	description: 'Test sequence',
	temperature: 7,
	actions: [{ action: 'click', selector: '#button' }]
};

const params: MeepleParams = {
	url: 'https://example.com',
	users: 5,
	sequences: { test: sequence }
};
```
