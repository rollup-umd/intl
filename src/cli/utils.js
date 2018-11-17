const { spawn: spawnDefault } = require('child_process');

const spawn = (command, cb) => {
  const split = command.split(' ');
  const program = split[0];
  const args = split.slice(1);
  const child = spawnDefault(program, args || []);
  const outputList = [];
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (data) => outputList.push(data) && console.log(data.replace(/\n$/, '')));
  child.stderr.on('data', (data) => outputList.push(data) && console.log(data.replace(/\n$/, '')));
  child.on('close', (code) => code === 1 ? cb(new Error(`child process exited with code ${code}`, [outputList.join('')])) : cb(null, [outputList.join('')]));
};

module.exports = {
  spawn,
};
