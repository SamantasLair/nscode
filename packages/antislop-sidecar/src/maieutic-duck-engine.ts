import {
  type MaieuticContextEnvelope,
  type MaieuticPhase,
  type MaieuticResponse,
  MaieuticContextEnvelopeSchema,
  MaieuticResponseSchema,
} from '@antislop/protocol';

export interface MaieuticSessionState {
  symbol: string;
  turn: number;
  phase: MaieuticPhase;
  history: MaieuticContextEnvelope[];
}

export class MaieuticDuckEngine {
  private sessions = new Map<string, MaieuticSessionState>();

  /**
   * Retrieves or initializes session state for the given symbol.
   */
  public getSession(symbol: string): MaieuticSessionState {
    let session = this.sessions.get(symbol);
    if (!session) {
      session = {
        symbol,
        turn: 0,
        phase: 'probe',
        history: [],
      };
      this.sessions.set(symbol, session);
    }
    return session;
  }

  /**
   * Resets active session state for a symbol, or all sessions if symbol is omitted.
   */
  public resetSession(symbol?: string): void {
    if (symbol) {
      this.sessions.delete(symbol);
    } else {
      this.sessions.clear();
    }
  }

  /**
   * Determines the maieutic dialectic phase based on turn count.
   * State machine follows: probe -> invariant -> synthesis -> resolution.
   */
  public resolvePhaseForTurn(turn: number): MaieuticPhase {
    if (turn <= 1) return 'probe';
    if (turn === 2) return 'invariant';
    if (turn === 3) return 'synthesis';
    return 'resolution';
  }

  /**
   * Processes a turn in the maieutic rubber-duck dialogue.
   * Strictly enforces the anti-spoonfeed invariant: prompts reasoning about
   * preconditions and postconditions without outputting the code answer.
   */
  public processDialecticTurn(envelope: MaieuticContextEnvelope): MaieuticResponse {
    const validatedEnvelope = MaieuticContextEnvelopeSchema.parse(envelope);
    const session = this.getSession(validatedEnvelope.symbol);

    session.turn += 1;
    session.phase = this.resolvePhaseForTurn(session.turn);
    session.history.push(validatedEnvelope);

    const userStatement = validatedEnvelope.userStatement.toLowerCase();
    const isAskingForCode =
      userStatement.includes('give me code') ||
      userStatement.includes('give me the code') ||
      userStatement.includes('write the code') ||
      userStatement.includes('show me the code') ||
      userStatement.includes('fix it for me') ||
      userStatement.includes('what is the solution') ||
      userStatement.includes('just fix this');

    const antiSpoonfeedPrefix = isAskingForCode
      ? '[Anti-Spoonfeed Invariant Active] I will not write the solution code for you. True mastery comes from reasoning through the invariants yourself. '
      : '';

    let dialecticQuestion = '';
    let suggestedReflection = '';

    switch (session.phase) {
      case 'probe': {
        const diagInfo = validatedEnvelope.diagnosticMessage
          ? ` (Diagnostic: "${validatedEnvelope.diagnosticMessage}")`
          : '';
        dialecticQuestion = `${antiSpoonfeedPrefix}At line ${validatedEnvelope.lineNumber}, before executing '${validatedEnvelope.symbol}'${diagInfo}, what preconditions and state guarantees are you assuming hold? What unhandled inputs could reach this boundary?`;
        suggestedReflection = `Trace the call chain entering '${validatedEnvelope.symbol}'. What assumptions is the caller making that the callee fails to enforce?`;
        break;
      }
      case 'invariant': {
        dialecticQuestion = `${antiSpoonfeedPrefix}What mathematical or logical invariant MUST hold true before and after calling '${validatedEnvelope.symbol}'? If that precondition is violated, how should the contract fail fast without masking underlying defects?`;
        suggestedReflection = `Define the invariant contract: Under what exact domain conditions does '${validatedEnvelope.symbol}' guarantee valid output? What constitutes an unrecoverable violation?`;
        break;
      }
      case 'synthesis': {
        dialecticQuestion = `${antiSpoonfeedPrefix}Synthesizing your invariant: how can you structure the control flow around line ${validatedEnvelope.lineNumber} using guards, discriminated types, or early returns so that invalid states become unrepresentable?`;
        suggestedReflection = `Review the branch structure: rather than adding defensive fallback slop, can you eliminate the invalid state at compile-time or with a clean guard clause?`;
        break;
      }
      case 'resolution': {
        dialecticQuestion = `${antiSpoonfeedPrefix}To achieve Popperian falsification: what boundary test case would conclusively falsify your implementation of '${validatedEnvelope.symbol}' if your invariants were violated?`;
        suggestedReflection = `Formulate an adversarial test case targeting extreme boundaries (e.g. empty collections, numeric limits, or poisoned references). Does your code uphold the invariant?`;
        break;
      }
    }

    const response: MaieuticResponse = {
      phase: session.phase,
      dialecticQuestion,
      antiSpoonfeedAssertion: true,
      suggestedReflection,
    };

    return MaieuticResponseSchema.parse(response);
  }
}
