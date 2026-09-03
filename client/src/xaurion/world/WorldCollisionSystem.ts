import { SolidObstacle } from '../types';

export class WorldCollisionSystem {
  private static instance: WorldCollisionSystem | null = null;
  private obstacles: Map<string, SolidObstacle> = new Map();
  private grid: Map<string, SolidObstacle[]> = new Map();
  public cellSize: number = 16.0;
  constructor() { WorldCollisionSystem.instance = this; }
  public static getInstance(): WorldCollisionSystem { if (!WorldCollisionSystem.instance) WorldCollisionSystem.instance = new WorldCollisionSystem(); return WorldCollisionSystem.instance; }
  private getGridKey(x: number, z: number): string { const gx = Math.floor(x / this.cellSize); const gz = Math.floor(z / this.cellSize); return `${gx}:${gz}`; }
  public registerObstacle(obstacle: SolidObstacle): void {
    if (this.obstacles.has(obstacle.id)) this.removeObstacle(obstacle.id);
    this.obstacles.set(obstacle.id, obstacle);
    const startGx = Math.floor((obstacle.x-obstacle.radius)/this.cellSize), endGx=Math.floor((obstacle.x+obstacle.radius)/this.cellSize), startGz=Math.floor((obstacle.z-obstacle.radius)/this.cellSize), endGz=Math.floor((obstacle.z+obstacle.radius)/this.cellSize);
    for(let gx=startGx;gx<=endGx;gx++) for(let gz=startGz;gz<=endGz;gz++){const key=`${gx}:${gz}`;let list=this.grid.get(key);if(!list){list=[];this.grid.set(key,list);}list.push(obstacle);}
  }
  public registerObstacles(list: SolidObstacle[]): void { for (const obs of list) this.registerObstacle(obs); }
  public removeObstacle(id: string): void {
    const obstacle=this.obstacles.get(id); if(!obstacle)return; this.obstacles.delete(id);
    const startGx=Math.floor((obstacle.x-obstacle.radius)/this.cellSize),endGx=Math.floor((obstacle.x+obstacle.radius)/this.cellSize),startGz=Math.floor((obstacle.z-obstacle.radius)/this.cellSize),endGz=Math.floor((obstacle.z+obstacle.radius)/this.cellSize);
    for(let gx=startGx;gx<=endGx;gx++)for(let gz=startGz;gz<=endGz;gz++){const key=`${gx}:${gz}`,list=this.grid.get(key);if(list){const idx=list.findIndex(o=>o.id===id);if(idx!==-1)list.splice(idx,1);if(!list.length)this.grid.delete(key);}}
  }
  public removeObstaclesByChunk(chunkKey:string):void{const ids:string[]=[];this.obstacles.forEach((o,id)=>{if(o.chunkKey===chunkKey)ids.push(id)});ids.forEach(id=>this.removeObstacle(id));}
  public getNearbyObstacles(x:number,z:number,queryRadius:number=8):SolidObstacle[]{const results:SolidObstacle[]=[];const seen=new Set<string>();for(let gx=Math.floor((x-queryRadius)/this.cellSize);gx<=Math.floor((x+queryRadius)/this.cellSize);gx++)for(let gz=Math.floor((z-queryRadius)/this.cellSize);gz<=Math.floor((z+queryRadius)/this.cellSize);gz++){const list=this.grid.get(`${gx}:${gz}`);if(list)for(const obs of list)if(!seen.has(obs.id)){seen.add(obs.id);const d2=(obs.x-x)**2+(obs.z-z)**2,maxD=obs.radius+queryRadius;if(d2<=maxD*maxD)results.push(obs);}}return results;}
  public resolveMovement(currentPos:{x:number;z:number},displacement:{x:number;z:number},playerRadius:number=.55){let posX=currentPos.x+displacement.x,posZ=currentPos.z+displacement.z;const candidates=this.getNearbyObstacles(currentPos.x,currentPos.z,playerRadius+Math.hypot(displacement.x,displacement.z)+4);if(!candidates.length)return{newPos:{x:posX,z:posZ},collided:false,slideVector:displacement};let collided=false,collidedObstacle:SolidObstacle|undefined;for(let it=0;it<3;it++){let pass=false;for(const obs of candidates){const dx=posX-obs.x,dz=posZ-obs.z,dist=Math.hypot(dx,dz),minDist=obs.radius+playerRadius;if(dist<minDist){collided=pass=true;collidedObstacle=obs;let nx=dx/(dist||.001),nz=dz/(dist||.001);if(dist<.0001){nx=displacement.x!==0?Math.sign(displacement.x):1;nz=displacement.z!==0?Math.sign(displacement.z):0;}posX=obs.x+nx*minDist;posZ=obs.z+nz*minDist;}}if(!pass)break;}return{newPos:{x:posX,z:posZ},collided,collidedObstacle,slideVector:{x:posX-currentPos.x,z:posZ-currentPos.z}};}
  public getTotalObstaclesCount():number{return this.obstacles.size;} public getAllObstacles():SolidObstacle[]{return Array.from(this.obstacles.values());}
}
export const collisionSystem=WorldCollisionSystem.getInstance();
