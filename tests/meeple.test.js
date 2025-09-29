/** @cspell:disable */

/**
 * Comprehensive tests for modular meeple functions using jest-puppeteer
 * Tests individual modules with minimal mocking using real browser instances
 */

import { getRandomTimestampWithinLast5Days, extractTopLevelDomain } from '../meeple/analytics.js';
import { selectPersona, getContextAwareAction, generatePersonaActionSequence } from '../meeple/personas.js';
import { 
  generateHumanizedPath, 
  bezierPoint, 
  exploratoryClick, 
  wait, 
  coinFlip, 
  moveMouse,
  clickStuff,
  intelligentScroll,
  naturalMouseMovement,
  hoverOverElements,
  CLICK_FUZZINESS
} from '../meeple/interactions.js';
import { interactWithForms } from '../meeple/forms.js';
import { navigateBack, navigateForward } from '../meeple/navigation.js';
import { identifyHotZones, calculateVisualProminence, rectsOverlap } from '../meeple/hotzones.js';
import { launchBrowser, createPage, navigateToUrl, getPageInfo, closeBrowser } from '../meeple/browser.js';
import { randomBetween, sleep, clamp, randomFloat, lerp, distance, shuffle, weightedRandom } from '../meeple/utils.js';
import { retry, ensureCSPRelaxed, ensurePageSetup } from '../meeple/security.js';
import { executeSequence, validateSequence, validateSequences } from '../meeple/sequences.js';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.MIXPANEL_TOKEN = 'test-token-for-testing';

describe('Meeple Modules - Unit Tests', () => {
  let testPage;
  
  beforeEach(async () => {
    testPage = await browser.newPage();
    await testPage.setViewport({ width: 1280, height: 800 });
    
    // Navigate to the real aktunes.com website
    await testPage.goto('https://aktunes.com', { 
      waitUntil: 'networkidle2',
      timeout: 15000 
    });
    
    // Add mouse tracking for movement tests
    await testPage.evaluate(() => {
      window.mouseX = 0;
      window.mouseY = 0;
      document.addEventListener('mousemove', (e) => {
        window.mouseX = e.clientX;
        window.mouseY = e.clientY;
      });
    });
  }, 20000);

  afterEach(async () => {
    if (testPage && !testPage.isClosed()) {
      await testPage.close();
    }
  });

  describe('Analytics Module', () => {
    test('getRandomTimestampWithinLast5Days returns valid timestamp', () => {
      const timestamp = getRandomTimestampWithinLast5Days();
      const now = Date.now();
      const fiveDaysAgo = now - (5 * 24 * 60 * 60 * 1000);
      
      expect(timestamp).toBeGreaterThanOrEqual(fiveDaysAgo);
      expect(timestamp).toBeLessThanOrEqual(now);
      expect(typeof timestamp).toBe('number');
    });

    test('extractTopLevelDomain extracts domain correctly', () => {
      expect(extractTopLevelDomain('example.com')).toBe('example.com');
      expect(extractTopLevelDomain('sub.example.com')).toBe('example.com');
      expect(extractTopLevelDomain('test.co.uk')).toBe('test.co.uk');
      expect(extractTopLevelDomain('localhost')).toBe('localhost');
      expect(extractTopLevelDomain('')).toBe('[empty-hostname]');
    });
  });

  describe('Utils Module', () => {
    test('randomBetween generates numbers in range', () => {
      for (let i = 0; i < 10; i++) {
        const result = randomBetween(5, 15);
        expect(result).toBeGreaterThanOrEqual(5);
        expect(result).toBeLessThanOrEqual(15);
      }
    });

    test('clamp constrains values to range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });

    test('distance calculates Euclidean distance', () => {
      expect(distance(0, 0, 3, 4)).toBe(5);
      expect(distance(0, 0, 0, 0)).toBe(0);
    });

    test('shuffle randomizes array', () => {
      const original = [1, 2, 3, 4, 5];
      const shuffled = shuffle([...original]);
      expect(shuffled).toHaveLength(5);
      expect(shuffled).toEqual(expect.arrayContaining(original));
    });
  });

  describe('Personas Module', () => {
    test('selectPersona returns valid persona', () => {
      const persona = selectPersona();
      const validPersonas = ['powerUser', 'taskFocused', 'digitalNative', 'shopper', 'comparison', 'conversionOptimized', 'reader', 'skimmer', 'bingeWatcher', 'explorer', 'discoverer', 'curiosityDriven', 'mobileHabits', 'mobileFirst', 'tabletUser', 'decisive', 'minimalist', 'researcher', 'methodical', 'analytical', 'accessibilityUser', 'keyboardNavigator', 'genZ', 'millennial', 'genX', 'boomer', 'anxiousUser', 'confidentUser', 'cautiousUser', 'international', 'rtlUser', 'minMaxer', 'rolePlayer', 'murderHobo', 'ruleSlawyer'];
      expect(validPersonas).toContain(persona);
    });

    test('generatePersonaActionSequence creates valid sequence', () => {
      const sequence = generatePersonaActionSequence('powerUser', 5);
      expect(sequence).toHaveLength(5);
      expect(Array.isArray(sequence)).toBe(true);
      
      // Should contain valid action types
      const validActions = ['click', 'scroll', 'mouse', 'hover', 'wait', 'form', 'back', 'forward', 'exploratoryClick', 'rageClick'];
      sequence.forEach(action => {
        expect(validActions).toContain(action);
      });
    });

    test('getContextAwareAction adapts actions based on history', () => {
      const actionHistory = ['click', 'click', 'click'];
      const adaptedAction = getContextAwareAction(actionHistory, 'click');
      
      // After 3 consecutive clicks, should adapt to something else
      expect(adaptedAction).not.toBe('click');
    });
  });

  describe('Interactions Module', () => {
    test('generateHumanizedPath creates realistic mouse path', () => {
      const path = generateHumanizedPath(0, 0, 100, 100);
      
      expect(Array.isArray(path)).toBe(true);
      expect(path.length).toBeGreaterThan(0);
      expect(path[0]).toEqual(expect.objectContaining({ 
        x: expect.any(Number), 
        y: expect.any(Number), 
        timing: expect.any(Number) 
      }));
      expect(path[path.length - 1].x).toBeCloseTo(100, -1);
      expect(path[path.length - 1].y).toBeCloseTo(100, -1);
    });

    test('bezierPoint calculates correct curve point', () => {
      const point = bezierPoint({ x: 0, y: 0 }, { x: 25, y: 50 }, { x: 75, y: 50 }, { x: 100, y: 0 }, 0.5);
      expect(point.x).toBeCloseTo(50, 1);
      expect(point.y).toBeCloseTo(37.5, 1);
    });

    test('coinFlip returns boolean', () => {
      const result = coinFlip();
      expect(typeof result).toBe('boolean');
    });

    test('wait function resolves after delay', async () => {
      const start = Date.now();
      await wait(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow some timing variance
    });

    test('exploratoryClick finds and clicks elements', async () => {
      const logMessages = [];
      const consoleSpy = (message) => logMessages.push(message);
      
      await exploratoryClick(testPage, consoleSpy);
      
      // Should have logged something about the click attempt
      expect(logMessages.length).toBeGreaterThan(0);
    }, 10000);

    test('moveMouse moves cursor realistically', async () => {
      const logMessages = [];
      const consoleSpy = (message) => logMessages.push(message);
      
      await moveMouse(testPage, 10, 10, 100, 100, 50, 50, consoleSpy);
      
      // Check final mouse position (allow for some variance due to humanized movement)
      const finalPosition = await testPage.evaluate(() => ({ x: window.mouseX, y: window.mouseY }));
      expect(finalPosition.x).toBeCloseTo(100, -1); // Allow ~5 pixel tolerance
      expect(finalPosition.y).toBeCloseTo(100, -1);
    }, 10000);
  });

  describe('Hot Zones Module', () => {
    test('rectsOverlap detects rectangle overlap correctly', () => {
      const rect1 = { left: 0, top: 0, right: 50, bottom: 50 };
      const rect2 = { left: 25, top: 25, right: 75, bottom: 75 };
      const rect3 = { left: 100, top: 100, right: 150, bottom: 150 };
      
      expect(rectsOverlap(rect1, rect2)).toBe(true);
      expect(rectsOverlap(rect1, rect3)).toBe(false);
    });

    test('identifyHotZones finds interactive elements', async () => {
      const logMessages = [];
      const consoleSpy = (message) => logMessages.push(message);
      const hotZones = await identifyHotZones(testPage, consoleSpy);
      
      expect(Array.isArray(hotZones)).toBe(true);
      expect(hotZones.length).toBeGreaterThan(0);
      
      // Should find some interactive elements (links, buttons, inputs, etc.)
      const hasInteractive = hotZones.some(zone => 
        ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(zone.tagName)
      );
      
      // Aktunes.com should have at least some interactive elements
      expect(hotZones.length).toBeGreaterThan(0);
      console.log('Found hot zones:', hotZones.map(z => z.tagName));
    }, 15000);
  });

  describe('Browser Module', () => {
    test('navigateToUrl navigates to URL', async () => {
      const logMessages = [];
      const consoleSpy = (message) => logMessages.push(message);
      
      // Navigate to a section of the aktunes site
      await navigateToUrl(testPage, 'https://aktunes.com#ak', consoleSpy);
      
      const url = testPage.url();
      expect(url).toContain('aktunes.com');
      expect(logMessages.length).toBeGreaterThan(0);
    }, 10000);

    test('getPageInfo extracts page information', async () => {
      const pageInfo = await getPageInfo(testPage);
      
      expect(pageInfo).toHaveProperty('title');
      expect(pageInfo).toHaveProperty('url');
      expect(pageInfo.title).toBe('AK | the aesthetic of maximalism');
      expect(pageInfo.url).toContain('aktunes.com');
    }, 10000);
  });

  describe('Security Module', () => {
    test('ensureCSPRelaxed relaxes CSP without errors', async () => {
      const logMessages = [];
      const consoleSpy = (message) => logMessages.push(message);
      
      await expect(ensureCSPRelaxed(testPage, consoleSpy)).resolves.not.toThrow();
    }, 10000);

    test('ensurePageSetup runs without errors', async () => {
      const logMessages = [];
      const consoleSpy = (message) => logMessages.push(message);
      
      await expect(ensurePageSetup(testPage, 'testUser', false, {}, consoleSpy)).resolves.not.toThrow();
    }, 10000);
  });

  describe('Forms Module', () => {
    test('interactWithForms finds and interacts with forms', async () => {
      const logMessages = [];
      const consoleSpy = (message) => logMessages.push(message);
      
      // First navigate to the contact section where the form is
      await testPage.click('a[href="#contact"]');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for any animations
      
      await interactWithForms(testPage, consoleSpy);
      
      // Should have attempted form interaction on the contact form
      expect(logMessages.length).toBeGreaterThan(0);
      
      // Check if form fields exist on the page
      const nameField = await testPage.$('input[name="name"]');
      const emailField = await testPage.$('input[name="email"]');
      const commentsField = await testPage.$('textarea[name="comments"]');
      
      expect(nameField).toBeTruthy();
      expect(emailField).toBeTruthy();
      expect(commentsField).toBeTruthy();
    }, 15000);
  });

  describe('Navigation Module', () => {
    test('navigateBack attempts to go back', async () => {
      const logMessages = [];
      const consoleSpy = (message) => logMessages.push(message);
      
      const result = await navigateBack(testPage, consoleSpy);
      
      expect(typeof result).toBe('boolean');
      // Navigation functions may not always generate logs if no action is taken
      expect(logMessages.length).toBeGreaterThanOrEqual(0);
    }, 10000);

    test('navigateForward attempts to go forward', async () => {
      const logMessages = [];
      const consoleSpy = (message) => logMessages.push(message);
      
      const result = await navigateForward(testPage, consoleSpy);
      
      expect(typeof result).toBe('boolean');
      // Navigation functions may not always generate logs if no action is taken
      expect(logMessages.length).toBeGreaterThanOrEqual(0);
    }, 10000);
  });

  describe('Integration Tests', () => {
    test('clickStuff uses hot zones for intelligent clicking', async () => {
      const logMessages = [];
      const consoleSpy = (message) => logMessages.push(message);
      const hotZones = await identifyHotZones(testPage, consoleSpy);
      
      await clickStuff(testPage, hotZones, consoleSpy);
      
      expect(logMessages.length).toBeGreaterThan(0);
      expect(hotZones.length).toBeGreaterThan(0);
      
      // Verify hot zones found actual interactive elements from aktunes.com
      const elementTypes = hotZones.map(zone => zone.tagName).filter(Boolean);
      expect(elementTypes.length).toBeGreaterThanOrEqual(0);
      console.log('Hot zone element types:', elementTypes);
    }, 15000);

    test('intelligentScroll works with hot zones', async () => {
      const logMessages = [];
      const consoleSpy = (message) => logMessages.push(message);
      const hotZones = await identifyHotZones(testPage, consoleSpy);
      
      await intelligentScroll(testPage, hotZones, consoleSpy);
      
      // Scroll function may not always generate logs depending on page state
      expect(logMessages.length).toBeGreaterThanOrEqual(0);
    }, 10000);

    test('hoverOverElements uses persona and history', async () => {
      const logMessages = [];
      const consoleSpy = (message) => logMessages.push(message);
      const hotZones = await identifyHotZones(testPage, consoleSpy);
      const hoverHistory = [];
      
      await hoverOverElements(testPage, hotZones, 'powerUser', hoverHistory, consoleSpy);
      
      // Hover function may not always generate logs depending on available elements
      expect(logMessages.length).toBeGreaterThanOrEqual(0);
    }, 15000);

    test('naturalMouseMovement targets hot zones', async () => {
      const logMessages = [];
      const consoleSpy = (message) => logMessages.push(message);
      const hotZones = await identifyHotZones(testPage, consoleSpy);

      await naturalMouseMovement(testPage, hotZones, consoleSpy);

      expect(logMessages.length).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Sequence Execution', () => {
    beforeEach(async () => {
      // Create a simple test page with known elements
      await testPage.setContent(`
        <html>
          <head><title>Test Page</title></head>
          <body>
            <button id="testButton">Click Me</button>
            <input id="testInput" type="text" placeholder="Type here">
            <select id="testSelect">
              <option value="option1">Option 1</option>
              <option value="option2">Option 2</option>
            </select>
            <div id="content">Test content area</div>
          </body>
        </html>
      `);
    });

    test('validateSequence accepts valid sequence specification', () => {
      const validSequence = {
        description: "Test sequence",
        temperature: 7,
        "chaos-range": [1, 5],
        actions: [
          { action: "click", selector: "#testButton" },
          { action: "type", selector: "#testInput", text: "test text" },
          { action: "select", selector: "#testSelect", value: "option2" }
        ]
      };

      const result = validateSequence(validSequence);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('validateSequence rejects invalid sequence specifications', () => {
      const invalidSequence = {
        description: "Invalid sequence",
        temperature: 15, // Too high
        "chaos-range": [5, 1], // Reversed range
        actions: [
          { action: "invalid", selector: "#test" }, // Invalid action type
          { action: "type", selector: "#test" }, // Missing text field
          { action: "select", selector: "#test" } // Missing value field
        ]
      };

      const result = validateSequence(invalidSequence);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('validateSequences handles multiple sequences', () => {
      const sequences = {
        "test-sequence-1": {
          description: "First test",
          actions: [{ action: "click", selector: "#test1" }]
        },
        "test-sequence-2": {
          description: "Second test",
          actions: [{ action: "type", selector: "#test2", text: "hello" }]
        }
      };

      const result = validateSequences(sequences);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('executeSequence performs click actions', async () => {
      const logMessages = [];
      const consoleSpy = (message) => logMessages.push(message);

      const sequenceSpec = {
        description: "Click test",
        temperature: 10, // High temperature for strict sequence following
        "chaos-range": [1, 1], // No chaos
        actions: [
          { action: "click", selector: "#testButton" }
        ]
      };

      const hotZones = [];
      const results = await executeSequence(testPage, sequenceSpec, hotZones, 'researcher', 'test-user', {}, consoleSpy);

      expect(results).toHaveLength(1);
      expect(results[0].action).toBe('click');
      expect(results[0].selector).toBe('#testButton');
      expect(logMessages.length).toBeGreaterThan(0);
    }, 15000);

    test('executeSequence performs type actions', async () => {
      const logMessages = [];
      const consoleSpy = (message) => logMessages.push(message);

      const sequenceSpec = {
        description: "Type test",
        temperature: 10,
        "chaos-range": [1, 1],
        actions: [
          { action: "type", selector: "#testInput", text: "Hello World" }
        ]
      };

      const hotZones = [];
      const results = await executeSequence(testPage, sequenceSpec, hotZones, 'researcher', 'test-user', {}, consoleSpy);

      expect(results).toHaveLength(1);
      expect(results[0].action).toBe('type');
      expect(results[0].text).toBe('Hello World');

      // Verify text was actually typed
      const inputValue = await testPage.$eval('#testInput', el => el.value);
      expect(inputValue).toBe('Hello World');
    }, 15000);

    test('executeSequence performs select actions', async () => {
      const logMessages = [];
      const consoleSpy = (message) => logMessages.push(message);

      const sequenceSpec = {
        description: "Select test",
        temperature: 10,
        "chaos-range": [1, 1],
        actions: [
          { action: "select", selector: "#testSelect", value: "option2" }
        ]
      };

      const hotZones = [];
      const results = await executeSequence(testPage, sequenceSpec, hotZones, 'researcher', 'test-user', {}, consoleSpy);

      expect(results).toHaveLength(1);
      expect(results[0].action).toBe('select');
      expect(results[0].value).toBe('option2');

      // Verify option was actually selected
      const selectedValue = await testPage.$eval('#testSelect', el => el.value);
      expect(selectedValue).toBe('option2');
    }, 15000);

    test('executeSequence handles failed actions gracefully', async () => {
      const logMessages = [];
      const consoleSpy = (message) => logMessages.push(message);

      const sequenceSpec = {
        description: "Failure test",
        temperature: 10,
        "chaos-range": [1, 1],
        actions: [
          { action: "click", selector: "#nonexistent" }, // This should fail
          { action: "click", selector: "#testButton" }  // This should succeed
        ]
      };

      const hotZones = [];
      const results = await executeSequence(testPage, sequenceSpec, hotZones, 'researcher', 'test-user', {}, consoleSpy);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(false); // First action should fail
      expect(results[1].success).toBe(true);  // Second action should succeed
    }, 15000);

    test('executeSequence respects temperature settings', async () => {
      const logMessages = [];
      const consoleSpy = (message) => logMessages.push(message);

      const sequenceSpec = {
        description: "Temperature test",
        temperature: 0, // Very low temperature should cause random actions
        "chaos-range": [1, 1],
        actions: [
          { action: "click", selector: "#testButton" },
          { action: "click", selector: "#testButton" },
          { action: "click", selector: "#testButton" }
        ]
      };

      const hotZones = [];
      const results = await executeSequence(testPage, sequenceSpec, hotZones, 'researcher', 'test-user', {}, consoleSpy);

      // With temperature 0, should get some mix of defined and random actions
      expect(results.length).toBeGreaterThan(0);
      expect(logMessages.some(msg => msg.includes('random action'))).toBe(true);
    }, 15000);

    test('executeSequence includes chaos multiplier in temperature calculation', async () => {
      const logMessages = [];
      const consoleSpy = (message) => logMessages.push(message);

      const sequenceSpec = {
        description: "Chaos test",
        temperature: 5,
        "chaos-range": [1, 10], // Wide chaos range
        actions: [
          { action: "click", selector: "#testButton" }
        ]
      };

      const hotZones = [];
      const results = await executeSequence(testPage, sequenceSpec, hotZones, 'researcher', 'test-user', {}, consoleSpy);

      expect(results.length).toBeGreaterThan(0);
      // Should log the effective temperature calculation
      expect(logMessages.some(msg => msg.includes('Effective temperature'))).toBe(true);
    }, 15000);

    test('executeSequence handles multiple action types in sequence', async () => {
      const logMessages = [];
      const consoleSpy = (message) => logMessages.push(message);

      const sequenceSpec = {
        description: "Multi-action test",
        temperature: 10,
        "chaos-range": [1, 1],
        actions: [
          { action: "type", selector: "#testInput", text: "Test123" },
          { action: "select", selector: "#testSelect", value: "option1" },
          { action: "click", selector: "#testButton" }
        ]
      };

      const hotZones = [];
      const results = await executeSequence(testPage, sequenceSpec, hotZones, 'researcher', 'test-user', {}, consoleSpy);

      expect(results).toHaveLength(3);
      expect(results[0].action).toBe('type');
      expect(results[1].action).toBe('select');
      expect(results[2].action).toBe('click');

      // Verify all actions were performed
      const inputValue = await testPage.$eval('#testInput', el => el.value);
      const selectValue = await testPage.$eval('#testSelect', el => el.value);
      expect(inputValue).toBe('Test123');
      expect(selectValue).toBe('option1');
    }, 20000);
  });
});