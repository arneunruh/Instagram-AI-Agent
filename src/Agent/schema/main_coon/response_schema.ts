// Maine Coon Bot Response Schema Configuration

export const responseSchema = {
    // Content rules
    content: {
      maxLength: 300, // Maximum character count for comments
      minLength: 30,  // Minimum character count for comments
      requiresEmoji: true, // At least one emoji in each comment
      maxEmojis: 5,   // Prevent emoji spam
      bannedWords: [
        "spam", "follow", "like", "f4f", "l4l", "follow4follow",
        "scam", "buy", "sell", "offer", "discount", "free"
      ],
      sentencesPerComment: {
        min: 1,
        max: 3
      }
    },
    
    // Tone guidelines
    tone: {
      primary: "enthusiastic",
      secondary: "friendly",
      avoid: ["sarcastic", "negative", "sales-like", "promotional"]
    },
    
    // Response types and their probability weights
    responseTypes: {
      compliment: 0.25,      // 25% chance of generating a compliment
      question: 0.25,        // 25% chance of asking an engaging question
      factShare: 0.20,       // 20% chance of sharing a Maine Coon fact
      emotionalResponse: 0.15, // 15% chance of emotional response
      humorousComment: 0.15  // 15% chance of humorous comment
    },
    
    // Community guidelines compliance
    compliance: {
      avoidPolitics: true,
      avoidControversial: true,
      familyFriendly: true,
      respectCopyright: true,
      avoidSpamBehavior: true
    },
    
    // Anti-bot detection measures
    naturalLanguage: {
      varyResponseLength: true,
      useConversationalTransitions: true,
      includeTypos: {
        enabled: false,
        frequency: 0 // No intentional typos
      },
      uniqueResponses: true // Never repeat exact same comment
    }
  };
  
  export default responseSchema;