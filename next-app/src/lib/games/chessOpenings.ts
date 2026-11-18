// Comprehensive ECO-style chess opening repertoire for randomized opening play.
// Lines are replayed with chess.js and indexed by normalized FEN (board + turn +
// castling + en-passant) so transpositions automatically merge.
import { Chess } from 'chess.js';

export interface OpeningBookMove {
  from: string;
  to: string;
  promotion?: 'q' | 'r' | 'b' | 'n';
  weight: number;
  opening: string;
}

interface OpeningLine {
  name: string;
  weight: number;
  moves: string[];
}

const OPENING_LINES: OpeningLine[] = [
  // ---- 1. e4 e5 (Open Games) ----------------------------------------------
  { name: 'Ruy Lopez: Morphy Defense (Closed)', weight: 5, moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6', 'c3', 'O-O', 'h3'] },
  { name: 'Ruy Lopez: Breyer Defense', weight: 3, moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6', 'c3', 'O-O', 'h3', 'Nb8', 'd4', 'Nbd7'] },
  { name: 'Ruy Lopez: Chigorin Defense', weight: 3, moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6', 'c3', 'O-O', 'h3', 'Na5', 'Bc2', 'c5', 'd4'] },
  { name: 'Ruy Lopez: Marshall Attack', weight: 3, moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'O-O', 'c3', 'd5', 'exd5', 'Nxd5'] },
  { name: 'Ruy Lopez: Open Defense', weight: 3, moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Nxe4', 'd4', 'b5', 'Bb3', 'd5', 'dxe5', 'Be6'] },
  { name: 'Ruy Lopez: Berlin Defense', weight: 4, moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6', 'O-O', 'Nxe4', 'd4', 'Nd6', 'Bxc6', 'dxc6', 'dxe5', 'Nf5', 'Qxd8+', 'Kxd8'] },
  { name: 'Ruy Lopez: Exchange Variation', weight: 2, moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6', 'dxc6', 'O-O', 'f6', 'd4', 'exd4', 'Nxd4'] },
  { name: 'Italian Game: Giuoco Piano', weight: 4, moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3', 'd6', 'O-O', 'O-O', 'Re1', 'a6'] },
  { name: 'Italian Game: Greco Attack', weight: 3, moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4', 'exd4', 'cxd4', 'Bb4+', 'Bd2', 'Bxd2+', 'Nbxd2', 'd5'] },
  { name: 'Italian Game: Evans Gambit', weight: 2, moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4', 'Bxb4', 'c3', 'Ba5', 'd4', 'exd4', 'O-O'] },
  { name: 'Italian Game: Two Knights Defense', weight: 3, moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'd3', 'Be7', 'O-O', 'O-O', 'Re1', 'd6', 'c3'] },
  { name: 'Italian Game: Fried Liver / Polerio', weight: 2, moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Na5', 'Bb5+', 'c6', 'dxc6', 'bxc6'] },
  { name: 'Scotch Game: Classical', weight: 3, moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4', 'Bc5', 'Be3', 'Qf6', 'c3', 'Nge7'] },
  { name: 'Scotch Game: Schmidt Variation', weight: 3, moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4', 'Nf6', 'Nxc6', 'bxc6', 'e5', 'Qe7', 'Qe2', 'Nd5'] },
  { name: 'Petrov Defense: Classical', weight: 3, moves: ['e4', 'e5', 'Nf3', 'Nf6', 'Nxe5', 'd6', 'Nf3', 'Nxe4', 'd4', 'd5', 'Bd3', 'Nc6', 'O-O'] },
  { name: 'Petrov Defense: Nimzowitsch Attack', weight: 2, moves: ['e4', 'e5', 'Nf3', 'Nf6', 'Nxe5', 'd6', 'Nf3', 'Nxe4', 'Nc3', 'Nxc3', 'dxc3', 'Be7', 'Be3'] },
  { name: 'Vienna Game: Falkbeer', weight: 2, moves: ['e4', 'e5', 'Nc3', 'Nf6', 'Bc4', 'Nxe4', 'Qh5', 'Nd6', 'Bb3', 'Nc6'] },
  { name: 'Vienna Game: Max Lange', weight: 2, moves: ['e4', 'e5', 'Nc3', 'Nc6', 'Bc4', 'Nf6', 'd3', 'Bc5', 'f4', 'd6'] },
  { name: 'Kings Gambit: Accepted', weight: 2, moves: ['e4', 'e5', 'f4', 'exf4', 'Nf3', 'g5', 'h4', 'g4', 'Ne5'] },
  { name: 'Kings Gambit: Falkbeer Countergambit', weight: 2, moves: ['e4', 'e5', 'f4', 'd5', 'exd5', 'e4', 'd3', 'Nf6'] },
  { name: 'Philidor Defense', weight: 2, moves: ['e4', 'e5', 'Nf3', 'd6', 'd4', 'Nf6', 'Nc3', 'Nbd7', 'Bc4', 'Be7'] },

  // ---- 1. e4 c5 (Sicilian Defense) -----------------------------------------
  { name: 'Sicilian Najdorf: English Attack', weight: 5, moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be3', 'e5', 'Nb3', 'Be6', 'f3'] },
  { name: 'Sicilian Najdorf: 6. Bg5', weight: 4, moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Bg5', 'e6', 'f4', 'Be7', 'Qf3'] },
  { name: 'Sicilian Najdorf: 6. Be2', weight: 4, moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be2', 'e5', 'Nb3', 'Be7', 'O-O'] },
  { name: 'Sicilian Najdorf: Fischer-Sozin', weight: 3, moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Bc4', 'e6', 'Bb3', 'b5'] },
  { name: 'Sicilian Dragon: Yugoslav Attack', weight: 4, moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6', 'Be3', 'Bg7', 'f3', 'O-O', 'Qd2', 'Nc6'] },
  { name: 'Sicilian Classical: Richter-Rauzer', weight: 3, moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'Nc6', 'Bg5', 'e6', 'Qd2', 'a6'] },
  { name: 'Sicilian Scheveningen', weight: 3, moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'e6', 'Be2', 'a6', 'O-O', 'Be7'] },
  { name: 'Sicilian Sveshnikov', weight: 4, moves: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'e5', 'Ndb5', 'd6', 'Bg5', 'a6', 'Na3', 'b5'] },
  { name: 'Sicilian Taimanov', weight: 4, moves: ['e4', 'c5', 'Nf3', 'e6', 'd4', 'cxd4', 'Nxd4', 'Nc6', 'Nc3', 'Qc7', 'Be3', 'a6'] },
  { name: 'Sicilian Kan', weight: 3, moves: ['e4', 'c5', 'Nf3', 'e6', 'd4', 'cxd4', 'Nxd4', 'a6', 'Bd3', 'Bc5', 'Nb3', 'Ba7'] },
  { name: 'Sicilian Alapin', weight: 3, moves: ['e4', 'c5', 'c3', 'Nf6', 'e5', 'Nd5', 'd4', 'cxd4', 'Nf3', 'Nc6', 'cxd4', 'd6'] },
  { name: 'Sicilian Alapin: 2...d5', weight: 3, moves: ['e4', 'c5', 'c3', 'd5', 'exd5', 'Qxd5', 'd4', 'Nf6', 'Nf3', 'e6'] },
  { name: 'Sicilian Closed', weight: 3, moves: ['e4', 'c5', 'Nc3', 'Nc6', 'g3', 'g6', 'Bg2', 'Bg7', 'd3', 'd6'] },
  { name: 'Sicilian Rossolimo', weight: 4, moves: ['e4', 'c5', 'Nf3', 'Nc6', 'Bb5', 'g6', 'O-O', 'Bg7', 'c3', 'Nf6', 'Re1', 'O-O'] },
  { name: 'Sicilian Moscow', weight: 3, moves: ['e4', 'c5', 'Nf3', 'd6', 'Bb5+', 'Bd7', 'Bxd7+', 'Qxd7', 'c4', 'Nc6'] },

  // ---- 1. e4 e6 (French Defense) ------------------------------------------
  { name: 'French Winawer', weight: 4, moves: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Bb4', 'e5', 'c5', 'a3', 'Bxc3+', 'bxc3', 'Ne7'] },
  { name: 'French Classical', weight: 4, moves: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e5', 'Nfd7', 'Bxe7', 'Qxe7', 'f4'] },
  { name: 'French Tarrasch: Open', weight: 3, moves: ['e4', 'e6', 'd4', 'd5', 'Nd2', 'c5', 'exd5', 'exd5', 'Ngf3', 'Nc6', 'Bb5'] },
  { name: 'French Tarrasch: Closed', weight: 3, moves: ['e4', 'e6', 'd4', 'd5', 'Nd2', 'Nf6', 'e5', 'Nfd7', 'Bd3', 'c5', 'c3', 'Nc6'] },
  { name: 'French Advance', weight: 3, moves: ['e4', 'e6', 'd4', 'd5', 'e5', 'c5', 'c3', 'Nc6', 'Nf3', 'Qb6', 'a3'] },
  { name: 'French Exchange', weight: 2, moves: ['e4', 'e6', 'd4', 'd5', 'exd5', 'exd5', 'Bd3', 'Bd6', 'Nf3', 'Nf6'] },

  // ---- 1. e4 c6 (Caro-Kann Defense) ---------------------------------------
  { name: 'Caro-Kann Classical', weight: 4, moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5', 'Ng3', 'Bg6', 'h4', 'h6', 'Nf3', 'Nd7'] },
  { name: 'Caro-Kann Advance: Short', weight: 4, moves: ['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'Nf3', 'e6', 'Be2', 'c5', 'Be3', 'Qb6'] },
  { name: 'Caro-Kann Panov-Botvinnik', weight: 3, moves: ['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5', 'c4', 'Nf6', 'Nc3', 'e6', 'Nf3', 'Bb4'] },
  { name: 'Caro-Kann Karpov', weight: 3, moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Nd7', 'Ng5', 'Ngf6', 'Bd3', 'e6'] },
  { name: 'Caro-Kann Tartakower', weight: 3, moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Nf6', 'Nxf6+', 'exf6', 'c3', 'Bd6'] },

  // ---- Other 1. e4 Defenses -----------------------------------------------
  { name: 'Pirc Defense: Austrian Attack', weight: 3, moves: ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6', 'f4', 'Bg7', 'Nf3', 'O-O'] },
  { name: 'Pirc Defense: Classical', weight: 3, moves: ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6', 'Nf3', 'Bg7', 'Be2', 'O-O', 'O-O'] },
  { name: 'Modern Defense', weight: 2, moves: ['e4', 'g6', 'd4', 'Bg7', 'Nc3', 'd6', 'Be3', 'a6', 'Qd2'] },
  { name: 'Alekhine Defense: Four Pawns', weight: 2, moves: ['e4', 'Nf6', 'e5', 'Nd5', 'd4', 'd6', 'c4', 'Nb6', 'f4'] },
  { name: 'Alekhine Defense: Modern', weight: 2, moves: ['e4', 'Nf6', 'e5', 'Nd5', 'd4', 'd6', 'Nf3', 'Bg4', 'Be2', 'e6'] },
  { name: 'Scandinavian Defense: 3...Qa5', weight: 3, moves: ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5', 'd4', 'Nf6', 'Nf3', 'Bf5'] },
  { name: 'Scandinavian Defense: 2...Nf6', weight: 2, moves: ['e4', 'd5', 'exd5', 'Nf6', 'd4', 'Nxd5', 'Nf3', 'g6', 'Be2'] },

  // ---- 1. d4 d5 (Queen's Gambit & Closed Games) ---------------------------
  { name: 'Queens Gambit Declined: Orthodox', weight: 5, moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O', 'Nf3', 'Nbd7', 'Rc1', 'c6'] },
  { name: 'Queens Gambit Declined: Tartakower', weight: 4, moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O', 'Nf3', 'h6', 'Bh4', 'b6'] },
  { name: 'Queens Gambit Declined: Ragozin', weight: 4, moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Nf3', 'Bb4', 'Bg5', 'h6', 'Bh4', 'dxc4'] },
  { name: 'Queens Gambit Declined: Exchange', weight: 4, moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'cxd5', 'exd5', 'Bg5', 'c6', 'e3', 'Be7'] },
  { name: 'Queens Gambit Accepted', weight: 4, moves: ['d4', 'd5', 'c4', 'dxc4', 'Nf3', 'Nf6', 'e3', 'e6', 'Bxc4', 'c5', 'O-O', 'a6'] },
  { name: 'Slav Defense: Main Line', weight: 4, moves: ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3', 'dxc4', 'a4', 'Bf5', 'e3', 'e6', 'Bxc4', 'Bb4'] },
  { name: 'Semi-Slav: Meran', weight: 4, moves: ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3', 'e6', 'e3', 'Nbd7', 'Bd3', 'dxc4', 'Bxc4', 'b5'] },
  { name: 'Semi-Slav: Anti-Moscow', weight: 3, moves: ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3', 'e6', 'Bg5', 'h6', 'Bh4', 'dxc4'] },
  { name: 'Tarrasch Defense', weight: 3, moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'c5', 'cxd5', 'exd5', 'Nf3', 'Nc6', 'g3'] },
  { name: 'London System', weight: 4, moves: ['d4', 'd5', 'Bf4', 'Nf6', 'e3', 'c5', 'c3', 'Nc6', 'Nd2', 'e6', 'Ngf3'] },

  // ---- 1. d4 Nf6 (Indian Defenses) ----------------------------------------
  { name: 'Nimzo-Indian: Rubinstein', weight: 5, moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4', 'e3', 'O-O', 'Bd3', 'd5', 'Nf3', 'c5', 'O-O'] },
  { name: 'Nimzo-Indian: Classical (4. Qc2)', weight: 4, moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4', 'Qc2', 'O-O', 'a3', 'Bxc3+', 'Qxc3', 'b6'] },
  { name: 'Nimzo-Indian: Samisch / Kmoch', weight: 3, moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4', 'f3', 'd5', 'a3', 'Bxc3+', 'bxc3', 'c5'] },
  { name: 'Queens Indian Defense', weight: 4, moves: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6', 'g3', 'Bb7', 'Bg2', 'Be7', 'O-O', 'O-O'] },
  { name: 'Bogo-Indian Defense', weight: 3, moves: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'Bb4+', 'Bd2', 'Qe7', 'g3', 'Nc6'] },
  { name: 'Catalan Opening: Open', weight: 5, moves: ['d4', 'Nf6', 'c4', 'e6', 'g3', 'd5', 'Bg2', 'dxc4', 'Nf3', 'Be7', 'O-O', 'O-O'] },
  { name: 'Catalan Opening: Closed', weight: 4, moves: ['d4', 'Nf6', 'c4', 'e6', 'g3', 'd5', 'Bg2', 'Be7', 'Nf3', 'O-O', 'O-O', 'c6'] },
  { name: 'Kings Indian Defense: Classical', weight: 5, moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O', 'Be2', 'e5', 'O-O', 'Nc6', 'd5', 'Ne7'] },
  { name: 'Kings Indian Defense: Samisch', weight: 3, moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'f3', 'O-O', 'Be3', 'e5'] },
  { name: 'Kings Indian Defense: Fianchetto', weight: 3, moves: ['d4', 'Nf6', 'c4', 'g6', 'Nf3', 'Bg7', 'g3', 'O-O', 'Bg2', 'd6', 'O-O', 'Nc6'] },
  { name: 'Grunfeld Defense: Exchange', weight: 4, moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5', 'cxd5', 'Nxd5', 'e4', 'Nxc3', 'bxc3', 'Bg7', 'Bc4', 'c5'] },
  { name: 'Grunfeld Defense: Russian', weight: 3, moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5', 'Nf3', 'Bg7', 'Qb3', 'dxc4', 'Qxc4', 'O-O'] },
  { name: 'Modern Benoni', weight: 3, moves: ['d4', 'Nf6', 'c4', 'c5', 'd5', 'e6', 'Nc3', 'exd5', 'cxd5', 'd6', 'e4', 'g6'] },
  { name: 'Benko Gambit', weight: 2, moves: ['d4', 'Nf6', 'c4', 'c5', 'd5', 'b5', 'cxb5', 'a6', 'bxa6', 'g6'] },
  { name: 'Trompowsky Attack', weight: 3, moves: ['d4', 'Nf6', 'Bg5', 'Ne4', 'Bf4', 'd5', 'e3', 'c5'] },
  { name: 'London System vs Nf6', weight: 3, moves: ['d4', 'Nf6', 'Bf4', 'g6', 'e3', 'Bg7', 'Nf3', 'O-O', 'Be2', 'd6'] },
  { name: 'Dutch Defense: Leningrad', weight: 3, moves: ['d4', 'f5', 'g3', 'Nf6', 'Bg2', 'g6', 'Nf3', 'Bg7', 'O-O', 'O-O'] },
  { name: 'Dutch Defense: Stonewall', weight: 2, moves: ['d4', 'f5', 'g3', 'Nf6', 'Bg2', 'e6', 'Nf3', 'd5', 'O-O', 'Bd6'] },

  // ---- Flank Openings (1. c4, 1. Nf3, 1. b3, 1. f4) ----------------------
  { name: 'English Opening: Reversed Sicilian', weight: 4, moves: ['c4', 'e5', 'Nc3', 'Nf6', 'Nf3', 'Nc6', 'g3', 'd5', 'cxd5', 'Nxd5', 'Bg2'] },
  { name: 'English Opening: Four Knights', weight: 3, moves: ['c4', 'e5', 'Nc3', 'Nf6', 'Nf3', 'Nc6', 'e3', 'Bb4', 'Qc2', 'Bxc3'] },
  { name: 'English Opening: Symmetrical', weight: 4, moves: ['c4', 'c5', 'Nc3', 'Nc6', 'g3', 'g6', 'Bg2', 'Bg7', 'Nf3', 'Nf6', 'O-O', 'O-O'] },
  { name: 'English Opening: Anglo-Indian', weight: 3, moves: ['c4', 'Nf6', 'Nc3', 'e6', 'Nf3', 'Bb4', 'Qc2', 'O-O', 'a3', 'Bxc3'] },
  { name: 'Reti Opening', weight: 4, moves: ['Nf3', 'd5', 'c4', 'e6', 'g3', 'Nf6', 'Bg2', 'Be7', 'O-O', 'O-O'] },
  { name: 'Reti Opening: Advance', weight: 3, moves: ['Nf3', 'd5', 'c4', 'd4', 'b4', 'f6', 'e3', 'e5'] },
  { name: 'Kings Indian Attack', weight: 3, moves: ['Nf3', 'd5', 'g3', 'c5', 'Bg2', 'Nc6', 'O-O', 'e5', 'd3'] },
  { name: 'Nimzo-Larsen Attack', weight: 2, moves: ['b3', 'e5', 'Bb2', 'Nc6', 'e3', 'Nf6', 'Bb5', 'Bd6'] },
  { name: 'Birds Opening', weight: 2, moves: ['f4', 'd5', 'Nf3', 'Nf6', 'e3', 'g6', 'Be2', 'Bg7'] },
];

export function positionKeyFromFen(fen: string): string {
  const parts = fen.split(' ');
  return `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]}`;
}

let cachedBook: Map<string, OpeningBookMove[]> | null = null;

function buildBook(): Map<string, OpeningBookMove[]> {
  if (cachedBook) return cachedBook;
  const book = new Map<string, OpeningBookMove[]>();
  for (const line of OPENING_LINES) {
    const g = new Chess();
    for (const san of line.moves) {
      const key = positionKeyFromFen(g.fen());
      let move;
      try {
        move = g.move(san);
      } catch {
        break;
      }
      if (!move) break;
      const list = book.get(key) ?? [];
      const promo = move.promotion as OpeningBookMove['promotion'];
      const existing = list.find((e) => e.from === move.from && e.to === move.to && e.promotion === promo);
      if (existing) {
        existing.weight += line.weight;
      } else {
        list.push({
          from: move.from,
          to: move.to,
          promotion: promo,
          weight: line.weight,
          opening: line.name,
        });
        book.set(key, list);
      }
    }
  }
  cachedBook = book;
  return book;
}

/** Returns all known opening book continuations for a FEN position. */
export function getOpeningBookMoves(fen: string): OpeningBookMove[] {
  return buildBook().get(positionKeyFromFen(fen)) ?? [];
}

/** Picks a weighted-random opening book move for the given FEN, or null if out of book. */
export function pickOpeningMove(
  fen: string,
  rng: () => number = Math.random
): { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' } | null {
  const options = getOpeningBookMoves(fen);
  if (options.length === 0) return null;
  let total = 0;
  for (const opt of options) total += opt.weight;
  let roll = rng() * total;
  for (const opt of options) {
    roll -= opt.weight;
    if (roll <= 0) {
      return { from: opt.from, to: opt.to, promotion: opt.promotion };
    }
  }
  const last = options[options.length - 1];
  return { from: last.from, to: last.to, promotion: last.promotion };
}

/** Number of unique positions in the opening book. */
export function getOpeningBookSize(): number {
  return buildBook().size;
}
