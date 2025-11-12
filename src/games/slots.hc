U0 Main() {

  if (credits >= bet) {
    credits = credits - bet;

    // Avoid logical operators; use nested conditionals for compatibility
    if (s1 == s2) {
      if (s2 == s3) {
        result = 2;
      } else {
        result = 1;
      }
    } else {
      if (s2 == s3) {
        result = 1;
      } else {
        if (s1 == s3) {
          result = 1;
        }
      }
    }

    if (result == 2) {
      winnings = bet * 15;
    } else if (result == 1) {
      winnings = bet * 4;
    }

    credits = credits + winnings;
    "\n";
    "Symbols: ";
    "%d ", s1;
    "%d ", s2;
    "%d\n", s3;
    "Winnings: %d\n", winnings;
    "Credits: %d\n", credits;
  }
}

// Execute single spin
Main();
