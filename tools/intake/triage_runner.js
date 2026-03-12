const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function terminateExecution(errorMessage) { 
  console.error('[SEV_FATAL] [EXECUTION_TERMINATED] ' + errorMessage); 
  process.exit(1); 
}

function parseCommandLineArgument(flagName) {
  const flagIndex = process.argv.indexOf(flagName);
  if (flagIndex === -1) return null;
  const flagValue = process.argv[flagIndex + 1];
  if (!flagValue || flagValue.startsWith('--')) return null;
  return flagValue;
}

const SUFFICIENCY_THRESHOLD = 2;
const RUN_CAP = 10;

const DETERMINATION_DUAL = 'Eligible for Desktop and Mobile browser forensic verification';
const DETERMINATION_DESKTOP = 'Eligible for Desktop browser forensic verification';
const DETERMINATION_INELIGIBLE = 'Not eligible for forensic verification';
const DETERMINATION_CONSTRAINED = 'Not eligible for forensic verification (constraints)';

function executeBrowserContext(browserContext, targetUrl, outputDirectory, runIdentifier) {
  const engineScripts = {
    desktop: path.join(process.cwd(), 'engine', 'run_smoke_desktop.js'),
    mobile:  path.join(process.cwd(), 'engine', 'run_smoke_mobile.js')
  };
  const targetScript = engineScripts[browserContext];
  if (!fs.existsSync(targetScript)) return { status: 'CONSTRAINED', note: 'HARD_CRASH' };
  const spawnResult = spawnSync(process.execPath, [targetScript, '--url', targetUrl, '--out', outputDirectory, '--run-id', String(runIdentifier)], {
    stdio: ['inherit', 'pipe', 'pipe'], timeout: 60000
  });
  const processOutput = ((spawnResult.stdout || '') + (spawnResult.stderr || '')).toString().toLowerCase();
  if (spawnResult.status !== 0) {
    if (processOutput.includes('bot') || processOutput.includes('captcha') || processOutput.includes('403') || processOutput.includes('blocked')) return { status: 'CONSTRAINED', note: 'BOT_MITIGATION' };
    if (processOutput.includes('auth') || processOutput.includes('login') || processOutput.includes('401')) return { status: 'CONSTRAINED', note: 'AUTH_WALL' };
    if (processOutput.includes('timeout') || processOutput.includes('crash')) return { status: 'CONSTRAINED', note: 'HARD_CRASH' };
    return { status: 'CONSTRAINED', note: 'NAV_IMPEDIMENT' };
  }
  return { status: 'OK', stdout: spawnResult.stdout.toString(), stderr: spawnResult.stderr.toString() };
}

function executeIntakeTriage() {
  const outputDirectory = parseCommandLineArgument('--out') || path.join(process.cwd(), '_intake_out');
  const targetsFilePath = path.join(outputDirectory, 'targets.txt');
  const runUnitsFilePath = path.join(outputDirectory, 'rununits.json');
  const mobileFlagFilePath = path.join(outputDirectory, 'mobileanchored.flag');

  if (!fs.existsSync(targetsFilePath)) terminateExecution('Missing targets.txt at ' + targetsFilePath);
  if (!fs.existsSync(runUnitsFilePath)) terminateExecution('Missing rununits.json at ' + runUnitsFilePath);

  const rawTarget = fs.readFileSync(targetsFilePath, 'utf8').trim();
  if (!rawTarget) terminateExecution('targets.txt is empty');

  const targetUrl = rawTarget.startsWith('http') ? rawTarget : 'https://' + rawTarget;
  const mobileAnchorStatus = fs.existsSync(mobileFlagFilePath) ? fs.readFileSync(mobileFlagFilePath, 'utf8').trim() : 'defensive';

  console.log('[SEV_INFO] [INTAKE_START] Target: ' + targetUrl);
  console.log('[SEV_INFO] [INTAKE_START] Mobile Anchor Status: ' + mobileAnchorStatus);

  const desktopRunResults = [];
  const mobileRunResults = [];
  let desktopSufficiencyCount = 0;
  let mobileSufficiencyCount = 0;
  let isMobileConstrained = false;
  let mobileConstraintCondition = '';
  let totalRunsExecuted = 0;
  const executionContexts = ['desktop', 'mobile'];

  while (totalRunsExecuted < RUN_CAP) {
    const currentContext = executionContexts[totalRunsExecuted % 2];
    totalRunsExecuted++;
    const isDesktopSufficient = desktopSufficiencyCount >= SUFFICIENCY_THRESHOLD;
    const isMobileSufficientOrBlocked = mobileSufficiencyCount >= SUFFICIENCY_THRESHOLD || isMobileConstrained;
    if (isDesktopSufficient && isMobileSufficientOrBlocked) break;
    if (currentContext === 'desktop' && isDesktopSufficient) continue;
    if (currentContext === 'mobile' && isMobileSufficientOrBlocked) continue;

    console.log('[SEV_INFO] [RUN_INITIATED] ID: ' + totalRunsExecuted + ' | Context: ' + currentContext.toUpperCase());
    const executionOutcome = executeBrowserContext(currentContext, targetUrl, outputDirectory, totalRunsExecuted);

    if (currentContext === 'desktop') {
      desktopRunResults.push({ runId: totalRunsExecuted, ...executionOutcome });
      if (executionOutcome.status === 'OK') desktopSufficiencyCount++;
      console.log('[SEV_INFO] [RUN_COMPLETED] Desktop Status: ' + executionOutcome.status + ' | Sufficiency: ' + desktopSufficiencyCount + '/' + SUFFICIENCY_THRESHOLD);
    } else {
      mobileRunResults.push({ runId: totalRunsExecuted, ...executionOutcome });
      if (executionOutcome.status === 'CONSTRAINED') {
        isMobileConstrained = true;
        mobileConstraintCondition = executionOutcome.note || 'NAV_IMPEDIMENT';
        console.log('[SEV_WARN] [RUN_CONSTRAINED] Mobile Blocked By: ' + mobileConstraintCondition);
      } else if (executionOutcome.status === 'OK') {
        mobileSufficiencyCount++;
        console.log('[SEV_INFO] [RUN_COMPLETED] Mobile Status: ' + executionOutcome.status + ' | Sufficiency: ' + mobileSufficiencyCount + '/' + SUFFICIENCY_THRESHOLD);
      }
    }
  }

  const isDesktopQualified = desktopSufficiencyCount >= SUFFICIENCY_THRESHOLD;
  const isMobileQualified = mobileSufficiencyCount >= SUFFICIENCY_THRESHOLD;
  const isCapReachedInconclusive = totalRunsExecuted >= RUN_CAP && !isDesktopQualified;

  let finalDetermination, eligibilityTier;
  if (isDesktopQualified && isMobileQualified) {
    finalDetermination = DETERMINATION_DUAL; eligibilityTier = 'TIER_1_DUAL';
  } else if (isDesktopQualified) {
    finalDetermination = DETERMINATION_DESKTOP; eligibilityTier = 'TIER_2_DESKTOP';
  } else if (isCapReachedInconclusive) {
    finalDetermination = DETERMINATION_CONSTRAINED; eligibilityTier = 'TIER_FAIL_CAP_REACHED';
  } else {
    finalDetermination = DETERMINATION_INELIGIBLE; eligibilityTier = 'TIER_FAIL_INELIGIBLE';
  }

  fs.writeFileSync(path.join(outputDirectory, 'desktop_results.json'), JSON.stringify(desktopRunResults, null, 2), 'utf8');
  fs.writeFileSync(path.join(outputDirectory, 'mobile_results.json'), JSON.stringify(mobileRunResults, null, 2), 'utf8');

  fs.writeFileSync(path.join(outputDirectory, 'DETERMINATION.txt'), [
    'ACCESS FORENSICS — CASE DETERMINATION',
    'generated_utc: ' + new Date().toISOString(),
    'target: ' + targetUrl,
    '',
    'DETERMINATION: ' + finalDetermination,
    ''
  ].join('\n'), 'utf8');

  if (isMobileConstrained) {
    fs.writeFileSync(path.join(outputDirectory, 'mobile_defensive_note.txt'), [
      'INTERNAL — NOT FOR DISCLOSURE',
      'generated_utc: ' + new Date().toISOString(),
      'target: ' + targetUrl,
      'constraint: ' + mobileConstraintCondition,
      'mobile_anchor: ' + mobileAnchorStatus,
      '',
      'Mobile forensic verification was attempted and encountered a technical barrier.',
      'This note is stored for internal forensic records only.',
      'It is not disclosed in the client-facing determination unless challenged.'
    ].join('\n'), 'utf8');
  }

  if (isCapReachedInconclusive) console.log('[SEV_WARN] [INTAKE_STOP] Run cap reached without sufficiency.');
  console.log('[SEV_INFO] [INTAKE_COMPLETE] Determination: ' + finalDetermination);
  console.log('[SEV_INFO] [INTAKE_COMPLETE] Tier Map: ' + eligibilityTier);
  console.log('[SEV_INFO] [INTAKE_COMPLETE] desktop_results.json : ' + path.join(outputDirectory, 'desktop_results.json'));
  console.log('[SEV_INFO] [INTAKE_COMPLETE] mobile_results.json  : ' + path.join(outputDirectory, 'mobile_results.json') + ' [INTERNAL]');
  console.log('[SEV_INFO] [INTAKE_COMPLETE] DETERMINATION.txt    : ' + path.join(outputDirectory, 'DETERMINATION.txt'));
}

try { 
  executeIntakeTriage(); 
} catch (executionError) { 
  terminateExecution(executionError && executionError.stack ? executionError.stack : String(executionError)); 
}
