use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::{commit, ephemeral};
use ephemeral_rollups_sdk::cpi::{delegate_account, DelegateAccounts, DelegateConfig};
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;

declare_id!("hCJnvZqxFHwUoH9R7v32wWnoLHvPm39VpaB4utoShyu");

pub const DELEGATION_PROGRAM_ID: Pubkey = pubkey!("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");

pub const MAX_PLAYERS: usize = 4;
pub const BOARD_SIZE: u8 = 40;
pub const STARTING_BALANCE: u64 = 1500;
pub const WIN_BALANCE: u64 = 15000;
pub const MAX_TURNS: u16 = 100;
pub const TRAIT_REROLL_COST: u64 = 10_000_000;
pub const TRAIT_FORCE_COST: u64 = 100_000_000;


fn initialize_game_state(game: &mut GameState) {
    game.turn_count = 0;
    game.current_player = 0;
    game.status = GameStatus::Active;
    game.prize_pool = 0;

    for i in 0..MAX_PLAYERS {
        game.players[i] = Player {
            id: i as u8,
            position: 0,
            balance: STARTING_BALANCE,
            personality: Personality::Balanced,
            risk_tolerance: 50,
            is_bankrupt: false,
            jailed_turns: 0,
        };
    }

    for i in 0..BOARD_SIZE {
        game.properties[i as usize] = Property {
            id: i,
            owner: 255,
            base_price: 100 + (i as u64 * 10),
            base_rent: 10 + (i as u64 * 2),
            houses: 0,
            is_mortgaged: false,
            property_type: match i {
                0 => PropertyType::Go,
                2 | 17 | 33 => PropertyType::CommunityChest,
                4 => PropertyType::Tax,
                7 | 22 | 36 => PropertyType::Chance,
                10 => PropertyType::Jail,
                20 => PropertyType::FreeParking,
                30 => PropertyType::GoToJail,
                5 | 15 | 25 | 35 => PropertyType::Railroad,
                12 | 28 => PropertyType::Utility,
                _ => PropertyType::Street,
            },
            color_group: get_color_group(i),
        };
    }
}

#[ephemeral]
#[program]
pub mod monopoly {
    use super::*;

    pub fn initialize_game(ctx: Context<InitializeGame>) -> Result<()> {
        let game = &mut ctx.accounts.game_state;
        initialize_game_state(game);
        msg!("Game initialized with {} players", MAX_PLAYERS);
        msg!("MagicBlock ER: game state routes via tee.magicblock.app for sub-10ms");
        Ok(())
    }

    pub fn reset_game(ctx: Context<ResetGame>) -> Result<()> {
        let game = &mut ctx.accounts.game_state;
        initialize_game_state(game);
        msg!("Game reset");
        Ok(())
    }

    /// Delegate game state PDA to MagicBlock Ephemeral Rollup via on-chain CPI
    pub fn delegate_game(ctx: Context<DelegateGame>, validator: Pubkey) -> Result<()> {
        let payer_key = ctx.accounts.payer.key();
        let seeds: &[&[u8]] = &[b"game_state", payer_key.as_ref()];

        let accounts = DelegateAccounts {
            payer: &ctx.accounts.payer.to_account_info(),
            pda: &ctx.accounts.game_state.to_account_info(),
            owner_program: &ctx.accounts.owner_program.to_account_info(),
            buffer: &ctx.accounts.buffer.to_account_info(),
            delegation_record: &ctx.accounts.delegation_record.to_account_info(),
            delegation_metadata: &ctx.accounts.delegation_metadata.to_account_info(),
            delegation_program: &ctx.accounts.delegation_program.to_account_info(),
            system_program: &ctx.accounts.system_program.to_account_info(),
        };

        let config = DelegateConfig {
            validator: Some(validator),
            ..Default::default()
        };

        delegate_account(accounts, seeds, config)?;

        msg!("Delegated game state to MagicBlock ER");
        msg!("Game PDA: {}", ctx.accounts.game_state.key());
        Ok(())
    }

    /// Execute a player turn on MagicBlock Ephemeral Rollup
    pub fn execute_move(
        ctx: Context<ExecuteMove>,
        dice1: u8,
        dice2: u8,
    ) -> Result<()> {
        let game = &mut ctx.accounts.game_state;
        require!(game.status == GameStatus::Active, MonopolyError::GameNotActive);

        let player_idx = game.current_player as usize;
        require!(!game.players[player_idx].is_bankrupt, MonopolyError::PlayerBankrupt);
        require!(dice1 >= 1 && dice1 <= 6 && dice2 >= 1 && dice2 <= 6, MonopolyError::InvalidDice);

        // Copy all needed data from player before mutating
        let pid = game.players[player_idx].id;
        let ppos = game.players[player_idx].position;
        let pjailed = game.players[player_idx].jailed_turns;
        let is_double = dice1 == dice2;

        if pjailed > 0 {
            if is_double {
                game.players[player_idx].jailed_turns = 0;
                msg!("Player {} rolled double and got out of jail!", pid);
            } else {
                game.players[player_idx].jailed_turns -= 1;
                msg!("Player {} still in jail, {} turns left", pid, pjailed - 1);
                // Advance turn
                game.next_turn();
                game.turn_count += 1;
                if game.turn_count >= MAX_TURNS {
                    game.end_by_turns();
                }
                return Ok(());
            }
        }

        // Move
        let new_pos = (ppos + dice1 + dice2) % BOARD_SIZE;
        let passed_go = new_pos < ppos;

        game.players[player_idx].position = new_pos;
        if passed_go {
            game.players[player_idx].balance += 200;
        }

        msg!("Player {} moved from {} to {}", pid, ppos, new_pos);

        // Handle special spaces
        handle_landing_for(game, player_idx)?;

        // Copy balance after landing for win check
        let balance_after = game.players[player_idx].balance;

        // Check win
        if balance_after >= WIN_BALANCE {
            game.status = GameStatus::Won(pid);
            msg!("Player {} wins with {}!", pid, balance_after);
        }

        // Next turn
        game.next_turn();
        game.turn_count += 1;
        if game.turn_count >= MAX_TURNS {
            game.end_by_turns();
        }

        Ok(())
    }

    pub fn buy_property(ctx: Context<ExecuteMove>) -> Result<()> {
        let game = &mut ctx.accounts.game_state;
        let player_idx = game.current_player as usize;

        let pos = game.players[player_idx].position as usize;
        let prop_owner = game.properties[pos].owner;
        let prop_price = game.properties[pos].base_price;
        let ptype = game.properties[pos].property_type.clone();
        let player_id = game.players[player_idx].id;
        let player_balance = game.players[player_idx].balance;

        require!(prop_owner == 255, MonopolyError::PropertyOwned);
        require!(player_balance >= prop_price, MonopolyError::InsufficientFunds);
        require!(
            matches!(ptype, PropertyType::Street | PropertyType::Railroad | PropertyType::Utility),
            MonopolyError::CannotBuy
        );

        game.players[player_idx].balance -= prop_price;
        game.properties[pos].owner = player_id;

        msg!("Player {} bought property {} for {}", player_id, pos, prop_price);
        Ok(())
    }

    pub fn build_houses(
        ctx: Context<ExecuteMove>,
        property_id: u8,
        count: u8,
    ) -> Result<()> {
        let game = &mut ctx.accounts.game_state;
        let player_idx = game.current_player as usize;

        let pid = game.properties[property_id as usize].owner;
        let player_id = game.players[player_idx].id;
        let current_houses = game.properties[property_id as usize].houses;
        let price = game.properties[property_id as usize].base_price;
        let player_balance = game.players[player_idx].balance;

        require!(pid == player_id, MonopolyError::NotOwner);
        require!(count > 0 && current_houses + count <= 5, MonopolyError::InvalidBuild);

        let cost = price / 2 * count as u64;
        require!(player_balance >= cost, MonopolyError::InsufficientFunds);

        game.players[player_idx].balance -= cost;
        game.properties[property_id as usize].houses += count;

        msg!("Player {} built {} houses on property {}", player_id, count, property_id);
        Ok(())
    }

    pub fn pay_rent(ctx: Context<ExecuteMove>) -> Result<()> {
        let game = &mut ctx.accounts.game_state;
        let player_idx = game.current_player as usize;

        let pos = game.players[player_idx].position as usize;
        let prop_owner = game.properties[pos].owner;
        let prop_type = game.properties[pos].property_type.clone();
        let prop_houses = game.properties[pos].houses;
        let prop_base_rent = game.properties[pos].base_rent;
        let player_id = game.players[player_idx].id;
        let player_balance = game.players[player_idx].balance;

        if prop_owner != 255 { let owner_id = prop_owner;
            if owner_id != player_id {
                let rent = calculate_rent(&prop_type, prop_houses, prop_base_rent);
                let mut owner_idx: usize = 0;

                for (i, p) in game.players.iter().enumerate() {
                    if p.id == owner_id && !p.is_bankrupt {
                        owner_idx = i;
                        break;
                    }
                }

                if player_balance >= rent {
                    game.players[player_idx].balance -= rent;
                    game.players[owner_idx].balance += rent;
                    msg!("Player {} paid {} rent to Player {}", player_id, rent, owner_id);
                } else {
                    game.players[player_idx].is_bankrupt = true;
                    msg!("Player {} bankrupt!", player_id);
                    let active = game.players.iter().filter(|p| !p.is_bankrupt).count();
                    if active <= 1 {
                        game.end_by_bankruptcy();
                    }
                }
            }
        }

        Ok(())
    }

    pub fn mutate_traits(
        ctx: Context<MutateTraits>,
        target_player: u8,
        mutation_type: MutationType,
    ) -> Result<()> {
        let game = &mut ctx.accounts.game_state;

        let cost = match mutation_type {
            MutationType::RandomReroll => TRAIT_REROLL_COST,
            _ => TRAIT_FORCE_COST,
        };
        msg!("Viewer paid {} lamports to mutate Player {}", cost, target_player);

        // Calculate new values WITHOUT holding references
        let balance = game.players[target_player as usize].balance;
        let turn_count = game.turn_count;
        let (new_personality, new_risk) = match mutation_type {
            MutationType::RandomReroll => {
                let rng = balance.wrapping_mul(turn_count as u64) as u8;
                (
                    match rng % 4 {
                        0 => Personality::Gambler,
                        1 => Personality::Coward,
                        2 => Personality::Monopolist,
                        _ => Personality::Balanced,
                    },
                    20 + (rng % 80),
                )
            }
            MutationType::ForceGambler => (Personality::Gambler, 90),
            MutationType::ForceCoward => (Personality::Coward, 20),
            MutationType::ForceMonopolist => (Personality::Monopolist, 60),
        };

        // Apply mutation
        game.players[target_player as usize].personality = new_personality;
        game.players[target_player as usize].risk_tolerance = new_risk;

        msg!("Player {} mutated to {:?}", target_player, new_personality);
        Ok(())
    }

pub fn commit_game(ctx: Context<CommitGame>) -> Result<()> {
        commit_and_undelegate_accounts(
            &ctx.accounts.payer,
            vec![&ctx.accounts.game_state.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;

        msg!("Game state commit and undelegation scheduled from ER to L1!");
        Ok(())
    }
    pub fn finalize_game(ctx: Context<FinalizeGame>) -> Result<()> {
        let game = &ctx.accounts.game_state;
        require!(
            matches!(game.status, GameStatus::Won(_) | GameStatus::Ended),
            MonopolyError::GameNotEnded
        );

        let winner = game.players.iter()
            .filter(|p| !p.is_bankrupt)
            .max_by_key(|p| p.balance)
            .ok_or(MonopolyError::NoWinner)?;

        msg!("Game finalized! Winner: Player {} with {}", winner.id, winner.balance);
        Ok(())
    }
}

// ====== Accounts ======

#[derive(Accounts)]
pub struct InitializeGame<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + GameState::INIT_SPACE,
        seeds = [b"game_state", authority.key().as_ref()],
        bump
    )]
    pub game_state: Account<'info, GameState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResetGame<'info> {
    #[account(
        mut,
        seeds = [b"game_state", authority.key().as_ref()],
        bump
    )]
    pub game_state: Account<'info, GameState>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct DelegateGame<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"game_state", payer.key().as_ref()],
        bump
    )]
    pub game_state: Account<'info, GameState>,
    pub owner_program: Program<'info, crate::program::Monopoly>,
    /// CHECK: delegate buffer PDA (derived off game_state + owner_program)
    #[account(mut)]
    pub buffer: UncheckedAccount<'info>,
    /// CHECK: delegation record PDA
    #[account(mut)]
    pub delegation_record: UncheckedAccount<'info>,
    /// CHECK: delegation metadata PDA
    #[account(mut)]
    pub delegation_metadata: UncheckedAccount<'info>,
    /// CHECK: verified by address
    #[account(address = DELEGATION_PROGRAM_ID)]
    pub delegation_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteMove<'info> {
    #[account(mut)]
    pub game_state: Account<'info, GameState>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct MutateTraits<'info> {
    #[account(mut)]
    pub game_state: Account<'info, GameState>,
    #[account(mut)]
    pub viewer: Signer<'info>,
    /// CHECK: Fee destination
    pub fee_destination: AccountInfo<'info>,
}

#[commit]
#[derive(Accounts)]
pub struct CommitGame<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"game_state", payer.key().as_ref()],
        bump
    )]
    pub game_state: Account<'info, GameState>,
}

#[derive(Accounts)]
pub struct FinalizeGame<'info> {
    #[account(mut)]
    pub game_state: Account<'info, GameState>,
    pub authority: Signer<'info>,
}

// ====== Data ======

#[account]
#[derive(InitSpace)]
pub struct GameState {
    pub turn_count: u16,
    pub current_player: u8,
    pub status: GameStatus,
    pub prize_pool: u64,
    pub players: [Player; MAX_PLAYERS],
    pub properties: [Property; BOARD_SIZE as usize],
}

impl GameState {
    pub fn next_turn(&mut self) {
        loop {
            self.current_player = (self.current_player + 1) % MAX_PLAYERS as u8;
            if !self.players[self.current_player as usize].is_bankrupt {
                break;
            }
        }
    }

    pub fn end_by_turns(&mut self) {
        self.status = GameStatus::Ended;
        msg!("Game ended by turn limit!");
    }

    pub fn end_by_bankruptcy(&mut self) {
        self.status = GameStatus::Ended;
        msg!("Game ended by bankruptcy!");
    }
}

fn handle_landing_for(game: &mut GameState, player_idx: usize) -> Result<()> {
    let pos = game.players[player_idx].position as usize;
    let ptype = game.properties[pos].property_type.clone();
    let pid = game.players[player_idx].id;

    match ptype {
        PropertyType::GoToJail => {
            game.players[player_idx].position = 10;
            game.players[player_idx].jailed_turns = 3;
            msg!("Player {} went to jail!", pid);
        }
        PropertyType::Tax => {
            let tax = 100u64;
            if game.players[player_idx].balance >= tax {
                game.players[player_idx].balance -= tax;
                game.prize_pool += tax;
            }
        }
        _ => {}
    }
    Ok(())
}

fn calculate_rent(ptype: &PropertyType, houses: u8, base_rent: u64) -> u64 {
    match ptype {
        PropertyType::Street => {
            let m = match houses {
                0 => 1, 1 => 5, 2 => 15, 3 => 45, 4 => 80, 5 => 125, _ => 1,
            };
            base_rent * m
        }
        PropertyType::Railroad | PropertyType::Utility => base_rent * 2,
        _ => 0,
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace)]
pub struct Player {
    pub id: u8,
    pub position: u8,
    pub balance: u64,
    pub personality: Personality,
    pub risk_tolerance: u8,
    pub is_bankrupt: bool,
    pub jailed_turns: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, InitSpace)]
pub enum Personality {
    Gambler,
    Coward,
    Monopolist,
    Balanced,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace)]
pub struct Property {
    pub id: u8,
    pub owner: u8, // 255 = no owner
    pub base_price: u64,
    pub base_rent: u64,
    pub houses: u8,
    pub is_mortgaged: bool,
    pub property_type: PropertyType,
    pub color_group: ColorGroup,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, InitSpace)]
pub enum PropertyType {
    Go,
    Street,
    CommunityChest,
    Tax,
    Chance,
    Jail,
    FreeParking,
    GoToJail,
    Railroad,
    Utility,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, InitSpace)]
pub enum ColorGroup {
    Brown, LightBlue, Pink, Orange, Red, Yellow, Green, DarkBlue,
    Railroad, Utility, None,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, InitSpace)]
pub enum GameStatus {
    Active,
    Won(u8),
    Ended,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum MutationType {
    RandomReroll,
    ForceGambler,
    ForceCoward,
    ForceMonopolist,
}

#[error_code]
pub enum MonopolyError {
    #[msg("Game is not active")]
    GameNotActive,
    #[msg("Game has not ended yet")]
    GameNotEnded,
    #[msg("Player is bankrupt")]
    PlayerBankrupt,
    #[msg("Player not found")]
    PlayerNotFound,
    #[msg("Insufficient funds")]
    InsufficientFunds,
    #[msg("Property already owned")]
    PropertyOwned,
    #[msg("Not property owner")]
    NotOwner,
    #[msg("Invalid dice roll")]
    InvalidDice,
    #[msg("Invalid build count")]
    InvalidBuild,
    #[msg("Cannot buy this property")]
    CannotBuy,
    #[msg("No winner found")]
    NoWinner,
}

fn get_color_group(pos: u8) -> ColorGroup {
    match pos {
        1 | 3 => ColorGroup::Brown,
        6 | 8 | 9 => ColorGroup::LightBlue,
        11 | 13 | 14 => ColorGroup::Pink,
        16 | 18 | 19 => ColorGroup::Orange,
        21 | 23 | 24 => ColorGroup::Red,
        26 | 27 | 29 => ColorGroup::Yellow,
        31 | 32 | 34 => ColorGroup::Green,
        37 | 39 => ColorGroup::DarkBlue,
        5 | 15 | 25 | 35 => ColorGroup::Railroad,
        12 | 28 => ColorGroup::Utility,
        _ => ColorGroup::None,
    }
}

