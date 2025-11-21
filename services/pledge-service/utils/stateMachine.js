// State machine for pledge lifecycle
const STATE_TRANSITIONS = {
  PENDING: ['AUTHORIZED', 'FAILED', 'CANCELLED'],
  AUTHORIZED: ['CAPTURED', 'FAILED', 'CANCELLED'],
  CAPTURED: ['COMPLETED', 'FAILED'],
  COMPLETED: [], // Terminal state
  FAILED: [], // Terminal state
  CANCELLED: [], // Terminal state
};

class StateMachine {
  static validateTransition(currentState, newState) {
    const allowedStates = STATE_TRANSITIONS[currentState];
    
    if (!allowedStates) {
      throw new Error(`Invalid current state: ${currentState}`);
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
}

module.exports = StateMachine;
