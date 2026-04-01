param prefix string
param location string
param tags object

resource redis 'Microsoft.Cache/redis@2023-08-01' = {
  name: '${prefix}-redis'
  location: location
  tags: tags
  properties: {
    sku: { name: 'Standard', family: 'C', capacity: 1 }
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
    redisConfiguration: { maxmemoryPolicy: 'allkeys-lru' }
  }
}

output host string = redis.properties.hostName
output port int = redis.properties.sslPort
