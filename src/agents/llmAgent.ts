import fetch from 'cross-fetch';

export interface AgentConfig {
  id: number;
  name: string;
  personality: string;
  riskTolerance: number; // 0-100
}

export interface DecisionContext {
  type: 'buy' | 'build' | 'trade';
  gameState: any;
  player: any;
  property?: any;
  buildableProperties?: any[];
  agentHistory?: string[];
  recentEvents?: string[];
  opponentContext?: string[];
}

export interface Decision {
  action: string;
  reasoning: string;
  confidence: number;
  propertyId?: number;
  count?: number;
}

export type DecisionType = 'buy' | 'build' | 'trade';

// OpenRouter API configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_API_BASE = process.env.OPENROUTER_API_URL || 'https://inference-api.nousresearch.com/v1';
const OPENROUTER_API_URL = OPENROUTER_API_BASE.replace(/\/$/, '') + '/chat/completions';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'Hermes-4-70B';

export class LLMAgent {
  private config: AgentConfig;
  private model: string;

  constructor(config: AgentConfig) {
    this.config = config;
    this.model = OPENROUTER_MODEL;
  }

  async makeDecision(context: DecisionContext): Promise<Decision> {
    const prompt = this.buildPrompt(context);
    const temperature = this.calculateTemperature();

    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://monopoly-ai.game',
          'X-Title': 'Monopoly AI Agents',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: this.getSystemPrompt(),
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature,
          max_tokens: 500,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) {
        throw new Error('Empty LLM response');
      }

      const decision = JSON.parse(content) as Decision;
      console.log(`[${this.config.name} / ${this.config.personality}] Decision:`, decision);

      return decision;
    } catch (error) {
      console.error(`LLM error for ${this.config.name}:`, error);
      return this.getFallbackDecision(context);
    }
  }

  private getSystemPrompt(): string {
    return `You are an AI agent playing Monopoly on Solana. Your decisions affect a real blockchain game with economic consequences.

PERSONALITY TRAITS GUIDE:
- Gambler: High risk, aggressive purchases, builds early, targets high-rent properties
- Coward: Conservative, only buys safe properties, hoards cash, avoids building
- Toxic: Unpredictable, makes emotional decisions, may overpay to block opponents
- Monopolist: Strategic, targets complete color groups, builds evenly, blocks opponents

Respond with valid JSON only:
{
  "action": "buy" | "pass" | "build" | "trade" | "mortgage",
  "reasoning": "brief explanation",
  "confidence": 0.0-1.0,
  "propertyId": number (if applicable),
  "count": number (if building)
}`;
  }

  private buildPrompt(context: DecisionContext): string {
    const { type, gameState, player, property, buildableProperties, agentHistory, recentEvents, opponentContext } = context;

    const basePrompt = `=== MONOPOLY GAME STATE ===

YOUR PROFILE:
- Name: ${this.config.name}
- Personality: ${this.config.personality}
- Risk Tolerance: ${this.config.riskTolerance}/100
- Current Balance: ${player.balance} SOL
- Position: ${player.position}
- Properties Owned: ${this.formatOwnedProperties(gameState.properties, player.id)}

GAME STATUS:
- Turn: ${gameState.turnCount}/100
- Active Players: ${gameState.players.filter((p: any) => !p.isBankrupt).length}
- Prize Pool: ${gameState.prizePool} SOL

OPPONENTS:
${this.formatOpponents(gameState.players, gameState.properties, player.id)}

YOUR RECENT DECISIONS:
${this.formatHistory(agentHistory, 'No prior decisions yet.')}

RECENT TABLE EVENTS:
${this.formatHistory(recentEvents, 'No recent table events.')}

OPPONENT RECENT ACTIONS:
${this.formatHistory(opponentContext, 'No opponent action history yet.')}

${type === 'buy' && property ? this.buildBuyPrompt(property) : ''}
${type === 'build' && buildableProperties ? this.buildBuildPrompt(buildableProperties) : ''}

DECISION REQUIRED: ${type.toUpperCase()}

What is your decision? Respond with JSON.`;

    return basePrompt;
  }

  private buildBuyPrompt(property: any): string {
    const colorGroupInfo = this.getColorGroupAnalysis(property.colorGroup);
    
    return `
PROPERTY OPPORTUNITY:
- Position: ${property.id}
- Type: ${property.propertyType}
- Color Group: ${property.colorGroup}
- Base Price: ${property.basePrice} SOL
- Base Rent: ${property.baseRent} SOL (${property.baseRent * 5} with hotel)
- Houses: ${property.houses}/5

COLOR GROUP ANALYSIS:
${colorGroupInfo}

This property ${property.basePrice < 200 ? 'is AFFORDABLE' : 'is EXPENSIVE'} for your balance.
`;
  }

  private buildBuildPrompt(properties: any[]): string {
    const options = properties.map(p => {
      const cost = p.basePrice / 2;
      const newRent = p.baseRent * (p.houses + 1) * 5;
      return `- Property ${p.id} (${p.colorGroup}): Build cost ${cost} SOL, new rent ${newRent} SOL`;
    }).join('\n');

    return `
BUILD OPTIONS:
You can build houses on these properties:
${options}

Building increases rent multiplier significantly.
`;
  }

  private calculateTemperature(): number {
    // Scale: 0.7 (safe) to 1.0 (chaotic)
    // Gambler (90) -> 0.97
    // Coward (20) -> 0.76
    return 0.7 + (this.config.riskTolerance / 100) * 0.3;
  }

  private getFallbackDecision(context: DecisionContext): Decision {
    const { type, player, property, buildableProperties } = context;

    // Simple rule-based fallback
    if (type === 'buy' && property) {
      const canAfford = player.balance > property.basePrice * 1.5;
      return {
        action: canAfford ? 'buy' : 'pass',
        reasoning: `Fallback: ${canAfford ? 'Can comfortably afford' : 'Too expensive'}`,
        confidence: 0.5,
      };
    }

    if (type === 'build' && buildableProperties && buildableProperties.length > 0) {
      const affordableBuilds = buildableProperties.filter(p => 
        player.balance > p.basePrice
      );
      
      if (affordableBuilds.length > 0) {
        return {
          action: 'build',
          reasoning: 'Fallback: Building first affordable property',
          confidence: 0.5,
          propertyId: affordableBuilds[0].id,
          count: 1,
        };
      }
    }

    return {
      action: 'pass',
      reasoning: 'Fallback: Conservative pass',
      confidence: 0.3,
    };
  }

  private formatOwnedProperties(properties: any[], playerId: number): string {
    const owned = properties.filter(p => p.owner === playerId);
    if (owned.length === 0) return 'None';
    
    return owned.map(p => `${p.id}(${p.houses}h)`).join(', ');
  }

  private formatOpponents(players: any[], properties: any[], currentId: number): string {
    return players
      .filter(p => p.id !== currentId && !p.isBankrupt)
      .map(p => {
        const wealth = p.balance + this.calculatePropertyWealth(p, properties);
        return `- Player ${p.id} (${p.personality}): ${p.balance} SOL, pos ${p.position}, total wealth ${wealth} SOL`;
      })
      .join('\n');
  }

  private calculatePropertyWealth(player: any, properties: any[]): number {
    return properties
      .filter(p => p.owner === player.id)
      .reduce((total, p) => total + p.basePrice * (1 + p.houses * 0.5), 0);
  }

  private getColorGroupAnalysis(colorGroup: string): string {
    const analysis: Record<string, string> = {
      'Brown': 'Starter group, cheap properties, low but starter rent.',
      'LightBlue': 'Early positions, good for blocking early game.',
      'Pink': 'Mid-tier, decent return on investment.',
      'Orange': 'High traffic area after jail, EXCELLENT investment.',
      'Red': 'Premium group, high rent when developed.',
      'Yellow': 'Late game group, expensive but profitable.',
      'Green': 'High value, require significant investment.',
      'DarkBlue': 'End of board, MASSIVE rents with hotels.',
      'Railroad': 'Rent scales with ownership of multiple railroads.',
      'Utility': 'Rent based on dice roll, variable income.',
    };
    
    return analysis[colorGroup] || 'Standard property.';
  }

  // Personality-specific decision mods
  private getPersonalityModifier(personality: string): number {
    const modifiers: Record<string, number> = {
      'Gambler': 1.5,
      'Coward': 0.5,
      'Toxic': 1.0, // Unpredictable, no modifier
      'Monopolist': 1.2,
    };
    return modifiers[personality] || 1.0;
  }

  private formatHistory(items: string[] | undefined, fallback: string): string {
    if (!items || items.length === 0) return fallback;
    return items.slice(-6).map((item) => `- ${item}`).join('\n');
  }
}

// Rate limiter for API calls
export class RateLimiter {
  private queue: (() => Promise<any>)[] = [];
  private processing = false;
  private delay: number;

  constructor(requestsPerSecond: number = 2) {
    this.delay = 1000 / requestsPerSecond;
  }

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        await task();
        await this.sleep(this.delay);
      }
    }
    
    this.processing = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton rate limiter
export const llmRateLimiter = new RateLimiter(2);
