import { testAdapter, databaseUser } from '@lucia-auth/adapter-test';
import { DynamoDBAdapter } from '../src/index.js';
import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  PutItemCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

const TableName = 'LuciaAuthTable';

let client: DynamoDBClient;

await new Promise<void>((resolve) => {
  console.log('Wait for 5 seconds so that db can be ready...')
  // wait for 5 seconds so that db can be ready
  setTimeout(() => {
    client = new DynamoDBClient({
      credentials: {
        accessKeyId: 'dummy',
        secretAccessKey: 'dummy',
      },
      region: 'dummy',
      endpoint: process.env.DYNAMODB_ENDPOINT_URL ?? 'http://127.0.0.1:8000',
    });
    resolve();
  }, 5000);
})
  .then(() => prepareTable(client))
  .then((adapter) => testAdapter(adapter))
  .then(() => { console.log('  \x1B[32m✓ Test for configuration passed\x1B[0m\n'); })
  .catch((e) => {
    console.error('  \x1B[31m✗ Test for configuration failed\x1B[0m\n');
    throw e;
  });

async function prepareTable(client: DynamoDBClient) {
  console.log('\n\x1B[38;5;63;1m[prepare]  \x1B[0mPreparing local DynamoDB table for configuration\x1B[0m\n');
  // create table if not exists
  await client.send(new DescribeTableCommand({ TableName: TableName }))
    .then(() => console.log('Detected existing auth table'))
    .catch(async (e) => {
      if (e instanceof ResourceNotFoundException) {
        console.log('Wait for table creation to complete...');
        return await client
          .send(new CreateTableCommand({
            TableName: TableName,
            AttributeDefinitions: [
              { AttributeName: 'Pk', AttributeType: 'S' },
              { AttributeName: 'Sk', AttributeType: 'S' },
              { AttributeName: 'Gs1Pk', AttributeType: 'S' },
              { AttributeName: 'Gs1Sk', AttributeType: 'S' },
              { AttributeName: 'Gs2Pk', AttributeType: 'S' },
              { AttributeName: 'Gs2Sk', AttributeType: 'S' },
            ],
            KeySchema: [
              { AttributeName: 'Pk', KeyType: 'HASH' }, // primary key
              { AttributeName: 'Sk', KeyType: 'RANGE' }, // sort key
            ],
            GlobalSecondaryIndexes: [
              {
                IndexName: 'Gs1',
                Projection: { ProjectionType: 'ALL' },
                KeySchema: [
                  { AttributeName: 'Gs1Pk', KeyType: 'HASH' }, // GSI primary key
                  { AttributeName: 'Gs1Sk', KeyType: 'RANGE' }, // GSI sort key
                ],
                ProvisionedThroughput: {
                  ReadCapacityUnits: 5,
                  WriteCapacityUnits: 5,
                },
              },
              {
                IndexName: 'Gs2',
                Projection: { ProjectionType: 'ALL' },
                KeySchema: [
                  { AttributeName: 'Gs2Pk', KeyType: 'HASH' }, // GSI primary key
                  { AttributeName: 'Gs2Sk', KeyType: 'RANGE' }, // GSI sort key
                ],
                ProvisionedThroughput: {
                  ReadCapacityUnits: 5,
                  WriteCapacityUnits: 5,
                },
              },
            ],
            ProvisionedThroughput: {
              ReadCapacityUnits: 5,
              WriteCapacityUnits: 5,
            },
          }))
          .then(() => new Promise((resolve) => {
            setTimeout(() => resolve(
              console.log('Successfully created auth table!')
            ), 3000); // wait for table creation completion
          }));
      }
      else throw e;
    })
    .then(async () => {
      console.log('Preparing test user...');
      // prepare the test user
      await client.send(new PutItemCommand({
        TableName: TableName,
        Item: marshall({
          Pk: `USER#${databaseUser.id}`,
          Sk: `USER#${databaseUser.id}`,
          HashedPassword: '123456',
          ...databaseUser.attributes
        }),
      }));
    }).then(() => {
      console.log('Successfully created test user!');
    });

  return new DynamoDBAdapter(client, {
    tableName: TableName,
    extraUserAttributes: ['HashedPassword'],
  });
}
