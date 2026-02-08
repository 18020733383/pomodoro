
export interface BioCall {
  id: string;
  timestamp: number;
  userInput: string;
  code: string;
  explanation: string;
  parameters: {
    system: string;
    level: number; // 0-100
    impact: 'positive' | 'negative' | 'neutral';
  };
}

export interface BodyState {
  heartRate: number;
  dopamine: number;
  cortisol: number;
  energy: number;
  lastUpdated: string;
}
