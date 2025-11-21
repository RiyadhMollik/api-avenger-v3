// State machine for payment lifecycle
const STATE_TRANSITIONS = {
  PENDING: ['AUTHORIZED', 'FAILED'],
  AUTHORIZED: ['CAPTURED', 'FAILED', 'REFUNDED'],
  CAPTURED: ['REFUNDED'],
  FAILED: [], // Terminal state
  REFUNDED: [], // Terminal state
};

class PaymentStateMachine {
  static validateTransition(currentState, newState) {
    const allowedStates = STATE_TRANSITIONS[currentState];
    
    if (!allowedStates) {
      throw new Error(`Invalid current state: ${currentState}`);
    }
    
    // Allow idempotent transitions (same state)
    if (currentState === newState) {
      return true;
    }
    
    if (!allowedStates.includes(newState)) {
      throw new Error(`Invalid state transition: ${currentState} -> ${newState}`);
    }
    
    return true;
  }

  static isTerminalState(state) {
    return STATE_TRANSITIONS[state].length === 0;
  }

  static getValidTransitions(currentState) {
    return STATE_TRANSITIONS[currentState] || [];
  }

  static canTransition(currentState, newState) {
    try {
      this.validateTransition(currentState, newState);
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = PaymentStateMachine;
