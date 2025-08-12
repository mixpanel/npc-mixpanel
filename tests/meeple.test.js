/** @cspell:disable */

/**
 * Comprehensive tests for modular meeple functions using jest-puppeteer
 * Tests individual modules with minimal mocking using real browser instances
 */

import { getRandomTimestampWithinLast5Days, extractTopLevelDomain } from '../meeple/analytics.js';
import { selectPersona, getContextAwareAction, generatePersonaActionSequence, weightedRandom } from '../meeple/personas.js';
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
import { randomBetween, sleep, clamp, randomFloat, lerp, distance, shuffle } from '../meeple/utils.js';
import { retry, ensureCSPRelaxed, ensurePageSetup } from '../meeple/security.js';

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
      expect(path[path.length - 1].x).toBeCloseTo(100, 1);
      expect(path[path.length - 1].y).toBeCloseTo(100, 1);
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
      
      // Check final mouse position
      const finalPosition = await testPage.evaluate(() => ({ x: window.mouseX, y: window.mouseY }));
      expect(finalPosition.x).toBeCloseTo(100, 0); // Allow 1 pixel tolerance
      expect(finalPosition.y).toBeCloseTo(100, 0);
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
      
      // Should find navigation links, buttons, and social icons on aktunes.com
      const hasLinks = hotZones.some(zone => zone.tagName === 'A');
      const hasButtons = hotZones.some(zone => zone.tagName === 'BUTTON');
      
      expect(hasLinks || hasButtons).toBe(true);
      
      // Should have some prominent elements based on the site structure
      expect(hotZones.length).toBeGreaterThan(5); // Navigation + social links + buttons
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
      expect(logMessages.length).toBeGreaterThan(0);
    }, 10000);

    test('navigateForward attempts to go forward', async () => {
      const logMessages = [];
      const consoleSpy = (message) => logMessages.push(message);
      
      const result = await navigateForward(testPage, consoleSpy);
      
      expect(typeof result).toBe('boolean');
      expect(logMessages.length).toBeGreaterThan(0);
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
      expect(elementTypes.length).toBeGreaterThan(0);
    }, 15000);

    test('intelligentScroll works with hot zones', async () => {
      const logMessages = [];
      const consoleSpy = (message) => logMessages.push(message);
      const hotZones = await identifyHotZones(testPage, consoleSpy);
      
      await intelligentScroll(testPage, hotZones, consoleSpy);
      
      expect(logMessages.length).toBeGreaterThan(0);
    }, 10000);

    test('hoverOverElements uses persona and history', async () => {
      const logMessages = [];
      const consoleSpy = (message) => logMessages.push(message);
      const hotZones = await identifyHotZones(testPage, consoleSpy);
      const hoverHistory = [];
      
      await hoverOverElements(testPage, hotZones, 'powerUser', hoverHistory, consoleSpy);
      
      expect(logMessages.length).toBeGreaterThan(0);
    }, 10000);

    test('naturalMouseMovement targets hot zones', async () => {
      const logMessages = [];
      const consoleSpy = (message) => logMessages.push(message);
      const hotZones = await identifyHotZones(testPage, consoleSpy);
      
      await naturalMouseMovement(testPage, hotZones, consoleSpy);
      
      expect(logMessages.length).toBeGreaterThan(0);
    }, 10000);
  });
});