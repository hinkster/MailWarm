param prefix string
param location string
param tags object
param caEnvId string
param acrServer string
param postgresHost string
param redisHost string
param mtaHost string       // Public IP of the MTA VM
param kvVaultUri string    // Key Vault URI for secret refs
param kvResourceId string  // Key Vault resource ID for role assignments
param apiUrl string        // Public URL of the API Container App (for tracking pixels)

// Key Vault Secrets User role — allows reading secret values
var kvSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

// ── API Container App ──────────────────────────────────────────────────────────
resource apiApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: '${prefix}-api'
  location: location
  tags: tags
  identity: { type: 'SystemAssigned' }
  properties: {
    environmentId: caEnvId
    configuration: {
      ingress: { external: true, targetPort: 3001, transport: 'http2' }
      registries: [{ server: acrServer, identity: 'system' }]
      secrets: [
        { name: 'db-url',          keyVaultUrl: '${kvVaultUri}secrets/DATABASE-URL',      identity: 'system' }
        { name: 'redis-url',       keyVaultUrl: '${kvVaultUri}secrets/REDIS-URL',          identity: 'system' }
        { name: 'nextauth-secret', keyVaultUrl: '${kvVaultUri}secrets/NEXTAUTH-SECRET',    identity: 'system' }
        { name: 'stripe-secret',   keyVaultUrl: '${kvVaultUri}secrets/STRIPE-SECRET-KEY',  identity: 'system' }
        { name: 'mta-smtp-user',   keyVaultUrl: '${kvVaultUri}secrets/MTA-SMTP-USER',      identity: 'system' }
        { name: 'mta-smtp-pass',   keyVaultUrl: '${kvVaultUri}secrets/MTA-SMTP-PASS',      identity: 'system' }
        { name: 'workos-api-key',  keyVaultUrl: '${kvVaultUri}secrets/WORKOS-API-KEY',     identity: 'system' }
      ]
    }
    template: {
      containers: [{
        name: 'api'
        image: '${acrServer}/mailwarm-api:latest'
        resources: { cpu: json('1.0'), memory: '2Gi' }
        env: [
          { name: 'NODE_ENV',              value: 'production' }
          { name: 'PORT',                  value: '3001' }
          { name: 'DATABASE_URL',          secretRef: 'db-url' }
          { name: 'REDIS_URL',             secretRef: 'redis-url' }
          { name: 'NEXTAUTH_SECRET',       secretRef: 'nextauth-secret' }
          { name: 'STRIPE_SECRET_KEY',     secretRef: 'stripe-secret' }
          { name: 'MTA_HOST',              value: mtaHost }
          { name: 'MTA_PORT_SUBMISSION',   value: '587' }
          { name: 'MTA_SMTP_USER',         secretRef: 'mta-smtp-user' }
          { name: 'MTA_SMTP_PASS',         secretRef: 'mta-smtp-pass' }
          { name: 'IMAP_HOST',             value: mtaHost }
          { name: 'IMAP_PORT',             value: '993' }
          { name: 'API_URL',               value: apiUrl }
          { name: 'WORKOS_API_KEY',        secretRef: 'workos-api-key' }
        ]
        probes: [{
          type: 'Liveness'
          httpGet: { path: '/health', port: 3001 }
          initialDelaySeconds: 10
          periodSeconds: 30
        }]
      }]
      scale: {
        minReplicas: 1
        maxReplicas: 10
        rules: [{ name: 'http-rule', http: { metadata: { concurrentRequests: '100' } } }]
      }
    }
  }
}

// ── Web Container App ──────────────────────────────────────────────────────────
resource webApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: '${prefix}-web'
  location: location
  tags: tags
  identity: { type: 'SystemAssigned' }
  properties: {
    environmentId: caEnvId
    configuration: {
      ingress: { external: true, targetPort: 3000, transport: 'http2' }
      registries: [{ server: acrServer, identity: 'system' }]
      secrets: [
        { name: 'nextauth-secret', keyVaultUrl: '${kvVaultUri}secrets/NEXTAUTH-SECRET', identity: 'system' }
      ]
    }
    template: {
      containers: [{
        name: 'web'
        image: '${acrServer}/mailwarm-web:latest'
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: [
          { name: 'NODE_ENV',              value: 'production' }
          { name: 'NEXTAUTH_URL',          value: 'https://${prefix}-web.${location}.azurecontainerapps.io' }
          { name: 'NEXTAUTH_SECRET',       secretRef: 'nextauth-secret' }
          { name: 'NEXT_PUBLIC_API_URL',   value: apiUrl }
          { name: 'NEXT_PUBLIC_APP_URL',   value: 'https://${prefix}-web.${location}.azurecontainerapps.io' }
        ]
      }]
      scale: { minReplicas: 1, maxReplicas: 5 }
    }
  }
}

// ── Worker Container App ───────────────────────────────────────────────────────
resource workerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: '${prefix}-worker'
  location: location
  tags: tags
  identity: { type: 'SystemAssigned' }
  properties: {
    environmentId: caEnvId
    configuration: {
      registries: [{ server: acrServer, identity: 'system' }]
      secrets: [
        { name: 'db-url',               keyVaultUrl: '${kvVaultUri}secrets/DATABASE-URL',        identity: 'system' }
        { name: 'redis-url',            keyVaultUrl: '${kvVaultUri}secrets/REDIS-URL',            identity: 'system' }
        { name: 'dovecot-master-user',  keyVaultUrl: '${kvVaultUri}secrets/DOVECOT-MASTER-USER',  identity: 'system' }
        { name: 'dovecot-master-pass',  keyVaultUrl: '${kvVaultUri}secrets/DOVECOT-MASTER-PASS',  identity: 'system' }
        { name: 'mta-internal-token',   keyVaultUrl: '${kvVaultUri}secrets/MTA-INTERNAL-TOKEN',   identity: 'system' }
      ]
    }
    template: {
      containers: [{
        name: 'worker'
        image: '${acrServer}/mailwarm-api:latest'
        command: ['node', 'dist/workers/index.js']
        resources: { cpu: json('1.0'), memory: '2Gi' }
        env: [
          { name: 'NODE_ENV',             value: 'production' }
          { name: 'DATABASE_URL',         secretRef: 'db-url' }
          { name: 'REDIS_URL',            secretRef: 'redis-url' }
          { name: 'MTA_HOST',             value: mtaHost }
          { name: 'MTA_PORT_SUBMISSION',  value: '587' }
          { name: 'IMAP_HOST',            value: mtaHost }
          { name: 'IMAP_PORT',            value: '993' }
          { name: 'API_URL',              value: apiUrl }
          { name: 'DOVECOT_MASTER_USER',  secretRef: 'dovecot-master-user' }
          { name: 'DOVECOT_MASTER_PASS',  secretRef: 'dovecot-master-pass' }
          { name: 'MTA_INTERNAL_TOKEN',   secretRef: 'mta-internal-token' }
        ]
      }]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

// ── Key Vault role assignments ─────────────────────────────────────────────────
// Grants each Container App's managed identity permission to read KV secrets.

resource apiKvRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(kvResourceId, apiApp.id, kvSecretsUserRoleId)
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsUserRoleId)
    principalId: apiApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource webKvRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(kvResourceId, webApp.id, kvSecretsUserRoleId)
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsUserRoleId)
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource workerKvRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(kvResourceId, workerApp.id, kvSecretsUserRoleId)
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsUserRoleId)
    principalId: workerApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output apiUrl string = 'https://${apiApp.properties.configuration.ingress.fqdn}'
output webUrl string = 'https://${webApp.properties.configuration.ingress.fqdn}'
