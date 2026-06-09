export const apiEn = {
  errors: {
    unauthorized: 'Unauthorized.',
    forbidden: 'Forbidden.',
    invalidGameId: 'Invalid game id.',
    gameNotFound: 'Game not found.',
    noCurrentGameSelected: 'No current game is selected. Join, resume, or start a game from the main menu.',
    noActiveGameAssigned: 'This account is not assigned to the current selected game. Join, resume, or start a game from the main menu.',
    gameNotActiveAskAdmin: 'This game is not currently active. Ask localAdmin to resume it.',
    playerNotFoundInGame: 'Player not found in the current game.'
  },
  auth: {
    register: {
      rateLimited: 'Too many registration attempts. Try again in {{retryAfterSeconds}} seconds.',
      invalidPayload: 'Invalid player name, email, or password.',
      userExists: 'User already exists.',
      emailExists: 'Email already exists.',
      captchaFailed: 'CAPTCHA verification failed.',
      successManualActivation: 'Account created. Email confirmation is required before login. For now activation must be completed manually on the server.'
    },
    resendConfirmation: {
      rateLimited: 'Too many confirmation resend attempts. Try again in {{retryAfterSeconds}} seconds.',
      invalidEmail: 'Invalid email.',
      cooldown: 'Confirmation can be resent again in {{retryAfterMinutes}} min.',
      successGeneric: 'If a pending account exists for that email, the confirmation window was refreshed. Email delivery is not configured yet on this server; activation must still be completed manually on the server.'
    },
    login: {
      rateLimited: 'Too many login attempts. Try again in {{retryAfterSeconds}} seconds.',
      invalidCredentials: 'Invalid player name or password.',
      userNotFound: 'No such user.',
      pendingConfirmation: 'Account is not confirmed yet.',
      wrongPasswordAttemptsLeft: 'Wrong password. Remaining attempts before a 10 minute lock: {{attemptsLeft}}.',
      accountLocked: 'Account login is locked due to too many wrong passwords. Try again in {{retryAfterMinutes}} min.'
    }
  },
  account: {
    settings: {
      notFound: 'Account not found.',
      rateLimited: 'Too many settings updates. Try again in {{retryAfterSeconds}} seconds.',
      invalidBotProfile: 'A valid bot profile is required when bot replacement is enabled.',
      forgotPasswordUnavailable: 'Password reset by email is not available yet.',
      tutorialsReset: 'Tutorial progress was reset for your current session.'
    }
  },
  game: {
    start: {
      requiresLocalAdmin: 'Local admin privileges are required to start a new game.',
      invalidSetupPayload: 'Invalid setup payload.',
      saveNewFailed: 'Unable to save the new game.'
    },
    saves: {
      readFailed: 'Unable to read game saves.',
      savedGameNotFound: 'Saved game not found.',
      loadFailed: 'Unable to load saved game.',
      deleteFailed: 'Unable to delete saved game.',
      requiresLocalAdmin: 'Local admin privileges are required to manage saves.',
      loginRequiredToManage: 'Login required to manage saves.',
      requiresLocalAdminToLoad: 'Local admin privileges are required to load the saved game.'
    }
  },
  games: {
    current: {
      unavailableResume: 'You do not currently have access to resume this game.',
      inactiveAskAdmin: 'This game is not currently active. Ask localAdmin to resume it.',
      noSaveAvailable: 'No save is available to reopen this game.',
      savedGameNotFound: 'The saved game could not be found.'
    },
    closeCurrent: {
      requiresLocalAdmin: 'Local admin privileges are required to close a single-player game.',
      selectFirst: 'Select this game as your current game first.',
      useMultiplayerActions: 'Use multiplayer leave/resume actions for multiplayer games.',
      notLoaded: 'This single-player game is not currently loaded.',
      failed: 'Unable to close the current single-player game.'
    }
  },
  gameplay: {
    endTurn: {
      processingInProgress: 'Turn processing is already in progress.',
      mailBlocked: 'Open Mail before ending the turn. Pending requests: {{pendingRequestCount}}. Unread messages: {{unreadMailCount}}.',
      notEnoughOnlineHumans: 'At least 2 human players must be online to progress this multiplayer game.',
      activeHumanRequired: 'At least 1 active human player must be present to progress this multiplayer game.',
      scheduledTurnsManualDisabled: 'Manual end turn is disabled while Scheduled Turns are enabled.',
      processingFailed: 'Turn processing failed.'
    }
  },
  multiplayer: {
    games: {
      notFound: 'Multiplayer game not found.',
      createRequiresLocalAdmin: 'Local admin privileges are required to create a multiplayer lobby.'
    },
    lobby: {
      joinableNotFound: 'Joinable multiplayer lobby not found.',
      notManageable: 'Draft multiplayer lobby not found or not manageable.',
      maxHumanPlayersReached: 'This multiplayer lobby already has the maximum number of human players.',
      joinFirst: 'Join the lobby first.'
    },
    resumeLobby: {
      requiresLocalAdmin: 'Local admin privileges are required to reopen an inactive multiplayer lobby.',
      savedInactiveNotFound: 'Saved inactive multiplayer game not found.',
      noSavedSnapshot: 'No saved snapshot is available for this multiplayer game.',
      savedSnapshotNotFound: 'Saved snapshot not found.',
      reopenFailed: 'Unable to reopen the saved multiplayer game.'
    },
    archive: {
      requiresLocalAdmin: 'Local admin privileges are required to archive multiplayer games.',
      inactiveGameNotFound: 'Inactive multiplayer game not found.'
    },
    joinRunning: {
      runningScheduledNotFound: 'Running Scheduled Turns multiplayer game not found.',
      accountAlreadyBelongs: 'This account already belongs to the selected game.',
      maxHumanPlayersReached: 'This Scheduled Turns game already has the maximum number of human players.',
      playerNameExists: 'A player with this name already exists in the selected game.',
      selectedGameUnavailable: 'The selected game is not currently available.',
      noSafeStartingSystem: 'No safe starting system is available for late join.',
      safeHomeworldFailed: 'Unable to create a safe late-join homeworld.'
    },
    leaveCurrentGame: {
      runningGameNotFound: 'Running multiplayer game not found.',
      joinFirst: 'Join the multiplayer game first.',
      savedBecauseTooFewOnlinePlayers: 'Not enough online players, saving and stopping the game.'
    },
    ready: {
      invalidPayload: 'Invalid ready payload.'
    },
    setup: {
      resumeLocked: 'Resume lobbies use locked saved-game settings.'
    },
    bindSave: {
      resumeLocked: 'Resume lobbies are already locked to their saved game.',
      saveSelectionRequired: 'Save selection is required.',
      failed: 'Unable to bind saved game.'
    },
    clearSave: {
      resumeLocked: 'Resume lobbies stay locked to their saved game.'
    },
    assignSeat: {
      invalidPayload: 'Invalid seat assignment payload.',
      savedSeatNotFound: 'Saved human seat not found.',
      memberNotFound: 'Lobby member not found.'
    },
    start: {
      onlyOneScheduledTurnsGame: 'Only one running Scheduled Turns multiplayer game can be active on this server.',
      failed: 'Unable to start multiplayer game.'
    },
    presence: {
      runningGameNotFound: 'Running multiplayer game not found.',
      autoSkipRequiresEnabledBoolean: 'Auto skip toggle requires an enabled boolean.'
    }
  },
  commands: {
    common: {
      queueFull: 'Queue full.',
      buildingRequirementsNotMet: 'Building requirements are not met.',
      technologyRequirementsNotMet: 'Technology requirements are not met.',
      insufficientResources: 'Insufficient resources.',
      onlyOwnPlanetModifiable: 'Only your own planets can be modified.',
      starSystemNotFound: 'Star system not found.',
      planetNotFound: 'Planet not found.'
    },
    building: {
      alreadyQueued: 'Building type is already queued.',
      unknownType: 'Unknown building type.'
    },
    shipyard: {
      buildShipyardFirst: 'Build Shipyard first.',
      unknownShipType: 'Unknown ship type.',
      unknownDefenceType: 'Unknown defence type.',
      bombDepotCapacityReached: 'Bomb Depot capacity reached.'
    },
    research: {
      buildResearchLabFirst: 'Build Research Lab first.',
      labAssignedAsHelper: 'Research Lab is currently assigned as helper.',
      unknownTechnologyType: 'Unknown technology type.',
      alreadyQueued: 'Technology is already being researched.',
      helperSystemNotFound: 'Helper planet star system not found.',
      helperPlanetNotFound: 'Helper planet not found.',
      helperPlanetMustBeOwned: 'Helper planet must be owned by you.',
      helperNeedsResearchLab: 'Selected helper planet has no Research Lab.',
      helperLabBusy: 'Selected helper lab is busy.',
      tooManyHelperLabs: 'Too many helper labs assigned.'
    },
    fleet: {
      missionUnavailable: 'Mission type is not available in phase 1.',
      missionDefinitionNotFound: 'Mission definition not found.',
      originPlanetNotFound: 'Origin planet not found.',
      targetPlanetNotFound: 'Target planet not found.',
      originPlanetMustBeOwned: 'Origin planet must be owned by you.',
      playerNotFound: 'Player not found.',
      activeFleetLimitReached: 'Active fleet limit reached. Upgrade COMPUTER_TECHNOLOGY to control more fleets.',
      selectAtLeastOneShip: 'Select at least one ship.',
      insufficientHangarSpace: 'Insufficient hangar space for carried ships and bombs.',
      insufficientBomberHangarSpace: 'Insufficient bomber hangar space for carried bombs.',
      insufficientCargoSpace: 'Insufficient cargo space.',
      insufficientResourcesCargoFuel: 'Insufficient resources for cargo and fuel.',
      jumpGateRequiresOwnedTarget: 'Jump Gate requires an owned target planet.',
      requestedShipSelectionUnavailable: 'Requested ship selection is no longer available on origin planet.'
    }
  }
} as const;
