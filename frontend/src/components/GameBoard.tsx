import { useMemo } from 'react';
import { Player } from '../hooks/useGame';
import { Train, Zap, HelpCircle, ParkingCircle, Lock } from 'lucide-react';

interface GameBoardProps {
  players: Player[];
  currentPlayer: number;
  turn: number;
}

interface BoardSpace {
  id: number;
  name: string;
  type: 'go' | 'property' | 'chance' | 'chest' | 'tax' | 'railroad' | 'utility' | 'jail' | 'parking' | 'gotojail';
  color?: string;
  price?: number;
  icon?: React.ReactNode;
}

const BOARD_SPACES: BoardSpace[] = [
  { id: 0, name: 'GO', type: 'go', icon: <span className="text-sm font-bold">GO</span> },
  { id: 1, name: 'Mediterranean', type: 'property', color: '#8B4513', price: 60 },
  { id: 2, name: 'Community', type: 'chest', icon: <span className="text-sm">?</span> },
  { id: 3, name: 'Baltic', type: 'property', color: '#8B4513', price: 60 },
  { id: 4, name: 'Income Tax', type: 'tax', icon: <span className="text-sm font-bold">$</span> },
  { id: 5, name: 'Reading RR', type: 'railroad', icon: <Train className="w-4 h-4" />, price: 200 },
  { id: 6, name: 'Oriental', type: 'property', color: '#87CEEB', price: 100 },
  { id: 7, name: 'Chance', type: 'chance', icon: <HelpCircle className="w-4 h-4" /> },
  { id: 8, name: 'Vermont', type: 'property', color: '#87CEEB', price: 100 },
  { id: 9, name: 'Connecticut', type: 'property', color: '#87CEEB', price: 120 },
  { id: 10, name: 'Jail', type: 'jail', icon: <Lock className="w-4 h-4" /> },
  { id: 11, name: 'St. Charles', type: 'property', color: '#FF69B4', price: 140 },
  { id: 12, name: 'Electric', type: 'utility', icon: <Zap className="w-4 h-4" />, price: 150 },
  { id: 13, name: 'States', type: 'property', color: '#FF69B4', price: 140 },
  { id: 14, name: 'Virginia', type: 'property', color: '#FF69B4', price: 160 },
  { id: 15, name: 'Pennsylvania RR', type: 'railroad', icon: <Train className="w-4 h-4" />, price: 200 },
  { id: 16, name: 'St. James', type: 'property', color: '#FFA500', price: 180 },
  { id: 17, name: 'Community', type: 'chest', icon: <span className="text-sm">?</span> },
  { id: 18, name: 'Tennessee', type: 'property', color: '#FFA500', price: 180 },
  { id: 19, name: 'New York', type: 'property', color: '#FFA500', price: 200 },
  { id: 20, name: 'Free Parking', type: 'parking', icon: <ParkingCircle className="w-5 h-5" /> },
  { id: 21, name: 'Kentucky', type: 'property', color: '#FF0000', price: 220 },
  { id: 22, name: 'Chance', type: 'chance', icon: <HelpCircle className="w-4 h-4" /> },
  { id: 23, name: 'Indiana', type: 'property', color: '#FF0000', price: 220 },
  { id: 24, name: 'Illinois', type: 'property', color: '#FF0000', price: 240 },
  { id: 25, name: 'B&O RR', type: 'railroad', icon: <Train className="w-4 h-4" />, price: 200 },
  { id: 26, name: 'Atlantic', type: 'property', color: '#FFFF00', price: 260 },
  { id: 27, name: 'Ventnor', type: 'property', color: '#FFFF00', price: 260 },
  { id: 28, name: 'Water Works', type: 'utility', icon: <span className="text-sm font-bold">W</span>, price: 150 },
  { id: 29, name: 'Marvin Gardens', type: 'property', color: '#FFFF00', price: 280 },
  { id: 30, name: 'Go To Jail', type: 'gotojail', icon: <span className="text-xs font-bold">GJ</span> },
  { id: 31, name: 'Pacific', type: 'property', color: '#008000', price: 300 },
  { id: 32, name: 'Carolina', type: 'property', color: '#008000', price: 300 },
  { id: 33, name: 'Community', type: 'chest', icon: <span className="text-sm">?</span> },
  { id: 34, name: 'Pennsylvania', type: 'property', color: '#008000', price: 320 },
  { id: 35, name: 'Short Line RR', type: 'railroad', icon: <Train className="w-4 h-4" />, price: 200 },
  { id: 36, name: 'Chance', type: 'chance', icon: <HelpCircle className="w-4 h-4" /> },
  { id: 37, name: 'Park Place', type: 'property', color: '#000080', price: 350 },
  { id: 38, name: 'Luxury Tax', type: 'tax', icon: <span className="text-sm font-bold">T</span> },
  { id: 39, name: 'Boardwalk', type: 'property', color: '#000080', price: 400 },
];

export function GameBoard({ players, currentPlayer, turn }: GameBoardProps) {
  const playersBySpace = useMemo(() => {
    const map = new Map<number, Player[]>();
    players.forEach((player) => {
      if (!player.isBankrupt) {
        const list = map.get(player.position) || [];
        list.push(player);
        map.set(player.position, list);
      }
    });
    return map;
  }, [players]);

  const renderPlayers = (spaceId: number) => {
    const playersHere = playersBySpace.get(spaceId);
    if (!playersHere || playersHere.length === 0) return null;

    return (
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
        {playersHere.map((player) => (
          <div
            key={player.id}
            className={`
              w-3.5 h-3.5 rounded-full border border-white shadow-lg
              ${player.id === currentPlayer ? 'animate-bounce' : ''}
              z-10
            `}
            style={{ backgroundColor: player.color }}
            title={player.name}
          />
        ))}
      </div>
    );
  };

  const renderCorner = (space: BoardSpace) => {
    const isGo = space.id === 0;
    const isJail = space.id === 10;
    const isParking = space.id === 20;
    const isGoToJail = space.id === 30;
    const isActive = players[currentPlayer]?.position === space.id;

    return (
      <div
        key={space.id}
        className={`
          relative aspect-square bg-monopoly-card rounded-lg
          flex flex-col items-center justify-center
          border-2 ${isActive ? 'border-violet-500 animate-pulse-border' : 'border-violet-900/50'}
          ${isGo ? 'border-green-500/50' : ''}
          ${isJail ? 'border-orange-500/50' : ''}
          ${isGoToJail ? 'border-red-500/50' : ''}
          transition-all duration-300
        `}
      >
        <div className="text-center p-1">
          {space.icon && <div className="mb-1">{space.icon}</div>}
          <span
            className={`text-xs font-bold ${isGo ? 'text-green-400' : ''} ${isJail ? 'text-orange-400' : ''} ${isParking ? 'text-blue-400' : ''} ${isGoToJail ? 'text-red-400' : ''}`}
          >
            {space.name}
          </span>
          {isGo && <div className="text-[10px] text-green-600">COLLECT 200</div>}
        </div>
        {renderPlayers(space.id)}
      </div>
    );
  };

  const renderSpace = (space: BoardSpace, isCompact = false) => {
    const isActive = players[currentPlayer]?.position === space.id;

    return (
      <div
        key={space.id}
        className={`
          relative bg-monopoly-card rounded overflow-hidden
          ${isCompact ? 'h-[72px]' : 'h-[84px]'}
          flex flex-col
          border ${isActive ? 'border-violet-500' : 'border-violet-900/30'}
          transition-all duration-200
          hover:border-violet-500/50
        `}
      >
        {space.color ? (
          <div className="h-2 w-full" style={{ backgroundColor: space.color }} />
        ) : (
          <div className="h-2 bg-gray-700/50" />
        )}

        <div className="flex-1 flex flex-col items-center justify-center p-1">
          <span className="text-[10px] text-center leading-tight text-gray-300 max-w-full truncate px-1">{space.name}</span>
          {space.price && <span className="text-[9px] text-amber-400">${space.price}</span>}
        </div>

        {renderPlayers(space.id)}
      </div>
    );
  };

  return (
    <div className="bg-monopoly-card/50 rounded-xl p-4 border border-violet-900/30">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Game Board</h2>
        {turn > 0 && <span className="text-xs text-violet-400 font-mono">Turn {turn}</span>}
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="min-w-[1280px] grid gap-1.5 grid-cols-[90px_repeat(9,100px)_90px] grid-rows-[90px_repeat(9,72px)_90px]">
          {renderCorner(BOARD_SPACES[20])}
          {[29, 28, 27, 26, 25, 24, 23, 22, 21].map((id) => renderSpace(BOARD_SPACES[id], true))}
          {renderCorner(BOARD_SPACES[30])}

          <div className="col-span-1 row-span-9 grid grid-rows-9 gap-1">
            {[19, 18, 17, 16, 15, 14, 13, 12, 11].map((id) => renderSpace(BOARD_SPACES[id], true))}
          </div>

          <div className="col-span-9 row-span-9 bg-monopoly-bg/50 rounded-lg p-4 flex flex-col items-center justify-center">
            <div className="text-center">
              <h3 className="text-xl font-bold gradient-text mb-2">MONARCHY</h3>
              <p className="text-xs text-gray-500 mb-4">AI Agents Battle on Solana</p>

              {players[currentPlayer] && (
                <div className="glass rounded-lg p-3 animate-glow">
                  <div
                    className="w-12 h-12 rounded-full mx-auto mb-2 border-2 border-white"
                    style={{ backgroundColor: players[currentPlayer].color }}
                  />
                  <div className="text-sm font-bold" style={{ color: players[currentPlayer].color }}>
                    {players[currentPlayer].name}
                  </div>
                  <div className="text-xs text-gray-400">{players[currentPlayer].personality}</div>
                  <div className="text-lg font-mono text-amber-400 mt-1">{players[currentPlayer].balance} SOL</div>
                </div>
              )}

              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/20 border border-violet-500/50">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs text-violet-400">Live on ER (sub-10ms)</span>
              </div>
            </div>
          </div>

          <div className="col-span-1 row-span-9 grid grid-rows-9 gap-1">
            {[31, 32, 33, 34, 35, 36, 37, 38, 39].map((id) => renderSpace(BOARD_SPACES[id], true))}
          </div>

          {renderCorner(BOARD_SPACES[10])}
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => renderSpace(BOARD_SPACES[id], true))}
          {renderCorner(BOARD_SPACES[0])}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-[10px] text-gray-500 justify-center">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#8B4513]" /> Brown</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#87CEEB]" /> Light Blue</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#FF69B4]" /> Pink</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#FFA500]" /> Orange</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#FF0000]" /> Red</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#FFFF00]" /> Yellow</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#008000]" /> Green</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#000080]" /> Dark Blue</span>
      </div>
    </div>
  );
}
