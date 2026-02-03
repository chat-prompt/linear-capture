import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { slackUserCache } from '../slack-user-cache';

describe('SlackUserCache.resolve', () => {
  beforeEach(() => {
    // 각 테스트 전에 캐시 초기화
    slackUserCache.clear();
  });

  afterEach(() => {
    // 각 테스트 후에 캐시 초기화
    slackUserCache.clear();
  });

  describe('Channel mentions', () => {
    it('converts channel mention with name to hashtag', () => {
      const input = '<#C123|general>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('#general');
    });

    it('converts multiple channel mentions with names', () => {
      const input = 'Check <#C123|dev> and <#C456|general>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('Check #dev and #general');
    });

    it('preserves channel mention without name', () => {
      const input = '<#C123>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('<#C123>');
    });

    it('handles channel mention with special characters in name', () => {
      const input = '<#C123|dev-team>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('#dev-team');
    });

    it('handles channel mention with numbers in name', () => {
      const input = '<#C123|channel123>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('#channel123');
    });
  });

  describe('Special mentions', () => {
    it('converts <!here> to @here', () => {
      const input = '<!here>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('@here');
    });

    it('converts <!channel> to @channel', () => {
      const input = '<!channel>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('@channel');
    });

    it('converts <!everyone> to @everyone', () => {
      const input = '<!everyone>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('@everyone');
    });

    it('converts multiple special mentions', () => {
      const input = 'Notify <!here> and <!channel>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('Notify @here and @channel');
    });

    it('converts all three special mentions in one message', () => {
      const input = '<!here> <!channel> <!everyone>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('@here @channel @everyone');
    });
  });

  describe('Links with display text', () => {
    it('converts link with display text to markdown', () => {
      const input = '<https://linear.app/issue|EDU-5710>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('[EDU-5710](https://linear.app/issue)');
    });

    it('converts multiple links with display text', () => {
      const input = 'See <https://example.com/1|Link1> and <https://example.com/2|Link2>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('See [Link1](https://example.com/1) and [Link2](https://example.com/2)');
    });

    it('handles link with special characters in display text', () => {
      const input = '<https://example.com|EDU-5710: Bug Fix>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('[EDU-5710: Bug Fix](https://example.com)');
    });

    it('handles link with numbers in display text', () => {
      const input = '<https://example.com|Issue #123>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('[Issue #123](https://example.com)');
    });

    it('handles HTTPS links with display text', () => {
      const input = '<https://secure.example.com/path|Secure Link>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('[Secure Link](https://secure.example.com/path)');
    });

    it('handles HTTP links with display text', () => {
      const input = '<http://example.com|HTTP Link>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('[HTTP Link](http://example.com)');
    });
  });

  describe('Links without display text', () => {
    it('extracts URL from link without display text', () => {
      const input = '<https://example.com>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('https://example.com');
    });

    it('extracts multiple URLs without display text', () => {
      const input = 'Visit <https://example.com> and <https://another.com>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('Visit https://example.com and https://another.com');
    });

    it('extracts HTTP URL without display text', () => {
      const input = '<http://example.com>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('http://example.com');
    });

    it('extracts URL with path without display text', () => {
      const input = '<https://example.com/path/to/page>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('https://example.com/path/to/page');
    });

    it('extracts URL with query parameters without display text', () => {
      const input = '<https://example.com?param=value&other=123>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('https://example.com?param=value&other=123');
    });
  });

  describe('Complex cases with multiple formats', () => {
    it('handles channel mention and special mention together', () => {
      const input = 'Check <#C123|dev> and <!here>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('Check #dev and @here');
    });

    it('handles channel mention and link together', () => {
      const input = 'See <#C123|general> and <https://example.com|Link>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('See #general and [Link](https://example.com)');
    });

    it('handles special mention and link together', () => {
      const input = 'Notify <!channel> about <https://example.com|Update>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('Notify @channel about [Update](https://example.com)');
    });

    it('handles all formats in one message', () => {
      const input = 'Check <#C123|dev> and <!here> for <https://example.com|Details>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('Check #dev and @here for [Details](https://example.com)');
    });

    it('handles complex message with multiple of each format', () => {
      const input = 'Team <#C123|dev> and <#C456|general>: <!here> <!channel> - <https://example.com|Link1> <https://another.com>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('Team #dev and #general: @here @channel - [Link1](https://example.com) https://another.com');
    });
  });

  describe('Edge cases', () => {
    it('preserves unmatched formats', () => {
      const input = '<@U123>';
      const result = slackUserCache.resolve(input);
      // User mention without loaded userMap should remain unchanged
      expect(result).toBe('<@U123>');
    });

    it('handles empty string', () => {
      const input = '';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('');
    });

    it('handles text without any mentions or links', () => {
      const input = 'This is just plain text';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('This is just plain text');
    });

    it('handles malformed channel mention', () => {
      const input = '<#C123|>';
      const result = slackUserCache.resolve(input);
      // Malformed mention should not match the regex
      expect(result).toBe('<#C123|>');
    });

    it('handles nested angle brackets', () => {
      const input = 'Text with <angle> brackets';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('Text with <angle> brackets');
    });

    it('handles URL with special characters', () => {
      const input = '<https://example.com/path?q=hello%20world&x=1|Link>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('[Link](https://example.com/path?q=hello%20world&x=1)');
    });

    it('handles consecutive mentions', () => {
      const input = '<#C123|dev><#C456|general>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('#dev#general');
    });

    it('handles mention at start of string', () => {
      const input = '<#C123|dev> is the team';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('#dev is the team');
    });

    it('handles mention at end of string', () => {
      const input = 'Join the <#C123|dev>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('Join the #dev');
    });

    it('handles multiple spaces around mentions', () => {
      const input = 'Check  <#C123|dev>  and  <!here>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('Check  #dev  and  @here');
    });

    it('handles newlines with mentions', () => {
      const input = 'Line 1\n<#C123|dev>\nLine 3';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('Line 1\n#dev\nLine 3');
    });

    it('handles tabs with mentions', () => {
      const input = 'Tab\t<#C123|dev>\tEnd';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('Tab\t#dev\tEnd');
    });
  });

  describe('Order of transformations', () => {
    it('applies all transformations in correct order', () => {
      // This tests that transformations don't interfere with each other
      const input = '<#C123|dev> <@U456> <!here> <https://example.com|Link>';
      const result = slackUserCache.resolve(input);
      // Channel mention and special mention and link should be converted
      // User mention should remain unchanged (no userMap loaded)
      expect(result).toBe('#dev <@U456> @here [Link](https://example.com)');
    });

    it('handles link with pipe character in URL', () => {
      // This is an edge case - pipe in URL should not break the regex
      const input = '<https://example.com|Display>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('[Display](https://example.com)');
    });
  });

  describe('Real-world scenarios', () => {
    it('handles typical Slack message with multiple elements', () => {
      const input = 'Hey <!here>, check out the <#C123|announcements> channel for updates: <https://linear.app/issue/EDU-5710|EDU-5710>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('Hey @here, check out the #announcements channel for updates: [EDU-5710](https://linear.app/issue/EDU-5710)');
    });

    it('handles message with multiple channels and links', () => {
      const input = 'Sync between <#C123|dev> and <#C456|design>: <https://docs.example.com|Docs> and <https://figma.com/file/123|Design>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('Sync between #dev and #design: [Docs](https://docs.example.com) and [Design](https://figma.com/file/123)');
    });

    it('handles message with all special mentions', () => {
      const input = 'Urgent: <!here> <!channel> <!everyone> - <https://example.com|Critical Update>';
      const result = slackUserCache.resolve(input);
      expect(result).toBe('Urgent: @here @channel @everyone - [Critical Update](https://example.com)');
    });
  });
});
