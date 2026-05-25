/**
 * Support Escalation Engine
 * 
 * Uses basic NLP/Keyword detection to break customers out of bot loops
 * when genuine frustration or urgency is detected.
 */

export interface SupportMessage {
  userId: string;
  shipmentId?: string;
  message: string;
  timestamp: Date;
}

const URGENCY_KEYWORDS = [
  'stolen', 'police', 'abogado', 'denuncia', 'robo', 
  'missing', 'perdido', 'urgente', 'urgency', 'help',
  'demand', 'sue'
];

export class SupportEscalationService {
  
  /**
   * Analyzes an incoming support message and determines if it should be 
   * routed to an automated bot or escalated to a human queue.
   */
  static analyzeMessage(message: SupportMessage): { escalate: boolean; reason?: string } {
    const text = message.message.toLowerCase();

    // 1. Keyword Detection
    for (const keyword of URGENCY_KEYWORDS) {
      if (text.includes(keyword)) {
        return { escalate: true, reason: `Urgency keyword detected: ${keyword}` };
      }
    }

    // 2. Repetition / Frustration Detection
    // In production, fetch recent messages from this userId from DB/Redis
    // If > 3 messages in 15 minutes, escalate.
    const isLooping = this.checkIfUserIsLooping(message.userId);
    if (isLooping) {
      return { escalate: true, reason: 'User caught in bot loop (repeated queries)' };
    }

    return { escalate: false };
  }

  private static checkIfUserIsLooping(_userId: string): boolean {
    // Mock implementation
    return false; 
  }

  /**
   * Escalate to a human agent, providing full context (tracking history, driver events)
   */
  static async escalateToHuman(message: SupportMessage, reason: string) {
    console.log(`[ESCALATION] Routing user ${message.userId} to human queue. Reason: ${reason}`);
    
    // Example: Create Zendesk/Intercom ticket with shipment context
    // const context = await prisma.shipment.findUnique({ ... })
    // await helpdesk.tickets.create({ ... })
  }
}
