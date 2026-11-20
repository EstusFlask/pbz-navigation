"""Repeated exact point queries over an immutable cooked triangle subset."""
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'build/offline-deps'))
import numpy as np

class TriangleDistances:
    def __init__(self,triangles):
        self.triangles=triangles
        self.base=triangles[:,0];self.first=triangles[:,1]-self.base;self.second=triangles[:,2]-self.base
        self.normal=np.cross(self.first,self.second);self.normal_squared=np.sum(self.normal*self.normal,axis=1)
        self.first_squared=np.sum(self.first*self.first,axis=1);self.mixed=np.sum(self.first*self.second,axis=1);self.second_squared=np.sum(self.second*self.second,axis=1)
        self.denominator=self.first_squared*self.second_squared-self.mixed*self.mixed;self.valid=np.abs(self.denominator)>1e-10
        self.edges=[]
        for index in range(3):
            base=triangles[:,index];edge=triangles[:,(index+1)%3]-base
            self.edges.append((base,edge,np.sum(edge*edge,axis=1)))

    def point(self,point):
        dot=np.sum((point-self.base)*self.normal,axis=1);projected=point-self.normal*(dot/np.maximum(self.normal_squared,1e-20))[:,None]
        relative=projected-self.base;first_dot=np.sum(relative*self.first,axis=1);second_dot=np.sum(relative*self.second,axis=1)
        first=(self.second_squared*first_dot-self.mixed*second_dot)/np.where(self.valid,self.denominator,1)
        second=(self.first_squared*second_dot-self.mixed*first_dot)/np.where(self.valid,self.denominator,1)
        inside=self.valid&(first>=-1e-8)&(second>=-1e-8)&(first+second<=1+1e-8)
        best=np.where(inside,dot*dot/np.maximum(self.normal_squared,1e-20),np.inf)
        for base,edge,length in self.edges:
            fraction=np.clip(np.sum((point-base)*edge,axis=1)/np.maximum(length,1e-20),0,1)
            best=np.minimum(best,np.sum((point-base-edge*fraction[:,None])**2,axis=1))
        return best

def capsule_support(point,triangles,radius=45):
    query=TriangleDistances(triangles);previous=point[2]+75+radius
    if np.min(query.point(np.array([point[0],point[1],previous])))<radius*radius:return None
    for height in np.arange(previous-10,point[2]-75+radius-10,-10):
        if np.min(query.point(np.array([point[0],point[1],height])))<=radius*radius:
            low=height;high=previous
            for _ in range(16):
                middle=(low+high)/2
                if np.min(query.point(np.array([point[0],point[1],middle])))<=radius*radius:low=middle
                else:high=middle
            return high-radius
        previous=height
    return None
