@description('Environment name (dev, staging, prod)')
param env string = 'prod'

@description('Azure region')
param location string = resourceGroup().location

@description('SSH public key for the MTA VM admin user')
@secure()
param mtaAdminSshPublicKey string

@description('PostgreSQL admin password')
@secure()
param postgresAdminPassword string

@description('NextAuth secret')
@secure()
param nextauthSecret string

@description('Stripe secret key')
@secure()
param stripeSecretKey string

@description('WorkOS API key')
@secure()
param workosApiKey string = ''

@description('SMTP username Haraka uses to accept submissions from the API')
@secure()
param mtaSmtpUser string

@description('SMTP password for the above user')
@secure()
param mtaSmtpPass string

@description('Internal token used between API and Haraka')
@secure()
param mtaInternalToken string

@description('AWS SES SMTP username (IAM SMTP credential)')
@secure()
param sesSmtpUser string

@description('AWS SES SMTP password (IAM SMTP credential)')
@secure()
param sesSmtpPass string


@description('Dovecot master-user username')
@secure()
param dovecotMasterUser string

@description('Dovecot master-user password')
@secure()
param dovecotMasterPass string

var prefix = 'mailwarm-${env}'
var tags = { environment: env, project: 'mailwarm' }

// ── ACR ───────────────────────────────────────────────────────────────────────
module acr './modules/acr.bicep' = {
  name: 'acr'
  params: { prefix: prefix, location: location, tags: tags }
}

// ── Log Analytics ─────────────────────────────────────────────────────────────
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${prefix}-logs'
  location: location
  tags: tags
  properties: { sku: { name: 'PerGB2018' }, retentionInDays: 30 }
}

// ── Container Apps Environment ────────────────────────────────────────────────
resource caEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: '${prefix}-env'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// ── PostgreSQL Flexible Server ────────────────────────────────────────────────
module postgres './modules/postgres.bicep' = {
  name: 'postgres'
  params: { prefix: prefix, location: location, tags: tags, adminPassword: postgresAdminPassword }
}

// ── Redis ─────────────────────────────────────────────────────────────────────
module redis './modules/redis.bicep' = {
  name: 'redis'
  params: { prefix: prefix, location: location, tags: tags }
}

// ── Key Vault ─────────────────────────────────────────────────────────────────
module keyvault './modules/keyvault.bicep' = {
  name: 'keyvault'
  params: { prefix: prefix, location: location, tags: tags }
}

// ── Key Vault secrets ─────────────────────────────────────────────────────────
resource kvSecretDbUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${prefix}-kv/DATABASE-URL'
  properties: {
    value: 'postgresql://mailwarm_admin:${postgresAdminPassword}@${postgres.outputs.host}/mailwarm?sslmode=require'
  }
  dependsOn: [keyvault]
}

resource kvSecretRedisUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${prefix}-kv/REDIS-URL'
  properties: {
    // Azure Cache for Redis uses TLS on port 6380 with the primary access key
    value: 'rediss://:${listKeys(resourceId('Microsoft.Cache/redis', '${prefix}-redis'), '2023-08-01').primaryKey}@${redis.outputs.host}:6380'
  }
  dependsOn: [keyvault, redis]
}

resource kvSecretNextauth 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${prefix}-kv/NEXTAUTH-SECRET'
  properties: { value: nextauthSecret }
  dependsOn: [keyvault]
}

resource kvSecretStripe 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${prefix}-kv/STRIPE-SECRET-KEY'
  properties: { value: stripeSecretKey }
  dependsOn: [keyvault]
}

resource kvSecretWorkos 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${prefix}-kv/WORKOS-API-KEY'
  properties: { value: workosApiKey }
  dependsOn: [keyvault]
}

resource kvSecretMtaSmtpUser 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${prefix}-kv/MTA-SMTP-USER'
  properties: { value: mtaSmtpUser }
  dependsOn: [keyvault]
}

resource kvSecretMtaSmtpPass 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${prefix}-kv/MTA-SMTP-PASS'
  properties: { value: mtaSmtpPass }
  dependsOn: [keyvault]
}

resource kvSecretMtaToken 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${prefix}-kv/MTA-INTERNAL-TOKEN'
  properties: { value: mtaInternalToken }
  dependsOn: [keyvault]
}

resource kvSecretDovecotUser 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${prefix}-kv/DOVECOT-MASTER-USER'
  properties: { value: dovecotMasterUser }
  dependsOn: [keyvault]
}

resource kvSecretDovecotPass 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${prefix}-kv/DOVECOT-MASTER-PASS'
  properties: { value: dovecotMasterPass }
  dependsOn: [keyvault]
}

resource kvSecretSesSmtpUser 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${prefix}-kv/SES-SMTP-USER'
  properties: { value: sesSmtpUser }
  dependsOn: [keyvault]
}

resource kvSecretSesSmtpPass 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${prefix}-kv/SES-SMTP-PASS'
  properties: { value: sesSmtpPass }
  dependsOn: [keyvault]
}

// ── Blob Storage ──────────────────────────────────────────────────────────────
resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: replace('${prefix}store', '-', '')
  location: location
  tags: tags
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
}

// ── MTA VM (Haraka + Dovecot) ─────────────────────────────────────────────────
module mtaVm './modules/mta-vm.bicep' = {
  name: 'mta-vm'
  params: {
    prefix: prefix
    location: location
    tags: tags
    adminSshPublicKey: mtaAdminSshPublicKey
  }
}

// AcrPull role for the MTA VM so it can pull images from ACR
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
resource vmAcrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.outputs.name, mtaVm.outputs.vmName, acrPullRoleId)
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: mtaVm.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

// ── Container Apps ────────────────────────────────────────────────────────────
// API URL is known after the Container App is created; use the deterministic FQDN pattern.
var apiUrl = 'https://mailwarm-${env}-api.${location}.azurecontainerapps.io'

module containerApps './modules/container-apps.bicep' = {
  name: 'container-apps'
  params: {
    prefix: prefix
    location: location
    tags: tags
    caEnvId: caEnv.id
    acrServer: acr.outputs.loginServer
    mtaHost: mtaVm.outputs.publicIpAddress
    kvVaultUri: keyvault.outputs.vaultUri
    kvResourceId: resourceId('Microsoft.KeyVault/vaults', '${prefix}-kv')
    apiUrl: apiUrl
  }
  dependsOn: [
    kvSecretDbUrl
    kvSecretRedisUrl
    kvSecretNextauth
    kvSecretStripe
    kvSecretMtaSmtpUser
    kvSecretMtaSmtpPass
    kvSecretMtaToken
    kvSecretDovecotUser
    kvSecretDovecotPass
  ]
}

output apiUrl string = containerApps.outputs.apiUrl
output webUrl string = containerApps.outputs.webUrl
output acrLoginServer string = acr.outputs.loginServer
output mtaPublicIp string = mtaVm.outputs.publicIpAddress
